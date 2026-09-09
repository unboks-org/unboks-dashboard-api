import {
  cleanup,
  within,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthContext } from "@/components/auth/AuthContext";
import { RentalDashboardShell } from "@/components/rental/RentalDashboardShell";
import MermaidToday from "@/pages/MermaidToday";
import { setClientSlug, setToken } from "@/lib/tenant";
import { tenantKeyFor } from "@/lib/query-keys";
import { useSetAgentStatus } from "@/hooks/use-agent-status";
import type { ReactNode } from "react";
import today from "../../../tests/isluno-today.fixture.json";
import recoveryToday from "../../../tests/isluno-recovery.fixture.json";
let enabled = true;
let status: any = { available: false, active: null, status: "unavailable" };
let statusFailure = false;
const caps = () => ({
  known: true,
  enabled,
  tenant_slug: "mermaid",
  brand: enabled
    ? { id: "isluno", name: "Isluno", assistant_name: "TRACY" }
    : null,
  capabilities: {
    brand_profile: enabled,
    itinerary_workspace: enabled,
    catalog_editor: enabled,
  },
});
const json = (body: unknown, statusCode = 200) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "X-Unboks-Tenant": "mermaid",
    },
  });
beforeEach(() => {
  setClientSlug("mermaid");
  setToken("fixture-token");
  history.replaceState(null, "", "/today");
  enabled = true;
  status = { available: false, active: null, status: "unavailable" };
  statusFailure = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/isluno/capabilities")) return json(caps());
      if (url.endsWith("/isluno/operations/today")) return json(today);
      if (url.endsWith("/agent/status")) {
        if (statusFailure) return json({}, 503);
        if (init?.method === "PUT")
          status = { ...status, active: JSON.parse(String(init.body)).active };
        return json(status);
      }
      if (url.endsWith("/client/profile"))
        return json({
          slug: "mermaid",
          name: "Mermaid Boat Trips Curaçao",
          status: "unknown",
        });
      if (
        url.includes("/mermaid-reservations") ||
        url.includes("/mermaid-crew-assistance")
      )
        return json({ items: [] });
      if (
        ["/messages/conversations", "/escalations", "/blocked-senders"].some(
          (path) => url.endsWith(path),
        )
      )
        return json([]);
      throw new Error("Unexpected/external fixture request denied: " + url);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup(child: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <AuthContext.Provider
      value={{
        isAuthenticated: true,
        clientSlug: "mermaid",
        logout: vi.fn(),
        login: vi.fn(),
        switchTenant: () => false,
      }}
    >
      <QueryClientProvider client={client}>{child}</QueryClientProvider>
    </AuthContext.Provider>,
  );
  return client;
}
it("uses server branding, real shell navigation and unknown controls without inventing health", async () => {
  setup(<MermaidToday />);
  await screen.findByRole("navigation", { name: "Isluno guest operations" });
  expect(
    screen.getAllByText("TRACY status unavailable").length,
  ).toBeGreaterThan(0);
  expect(
    screen
      .getByRole("button", { name: "TRACY controls unavailable" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.getByText(/Demo availability is assumed/)).toBeTruthy();
  expect(
    await screen.findByRole("heading", { name: "Pending actions & attention" }),
  ).toBeTruthy();
  expect(screen.getAllByText("ambiguous").length).toBeGreaterThan(0);
  fireEvent.click(
    screen.getAllByRole("button", { name: "Products & pricing" })[0],
  );
  expect(location.pathname + location.search).toBe(
    "/settings?category=trip-pricing",
  );
  expect(
    vi
      .mocked(fetch)
      .mock.calls.every(
        ([, options]) => !options?.method || options.method === "GET",
      ),
  ).toBe(true);
});
it("retains legacy brand and a return path when visiting historical operations", async () => {
  history.replaceState(null, "", "/today?view=mermaid");
  setup(<MermaidToday />);
  await screen.findByRole("navigation", { name: "Mermaid guest operations" });
  expect(await screen.findByText("Mermaid records")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Open current itineraries" })
      .getAttribute("href"),
  ).toBe("/reservations");
  fireEvent.click(screen.getAllByRole("button", { name: "Reservations" })[0]);
  expect(location.search).toBe("?view=mermaid");
});
it("capability off keeps Mermaid navigation and does not request Isluno operations", async () => {
  enabled = false;
  setup(<MermaidToday />);
  await screen.findByRole("navigation", { name: "Mermaid guest operations" });
  expect(
    screen.queryByRole("navigation", { name: "Isluno guest operations" }),
  ).toBeNull();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(([url]) => String(url).includes("/isluno/operations")),
  ).toBe(false);
});
it("renders failed status explicitly and keeps controls disabled", async () => {
  statusFailure = true;
  setup(
    <RentalDashboardShell active="today" title="Today">
      Fixture
    </RentalDashboardShell>,
  );
  await screen.findByRole("navigation", { name: "Isluno guest operations" });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "TRACY controls unavailable" })
        .hasAttribute("disabled"),
    ).toBe(true),
  );
  expect(screen.queryByText("TRACY is active")).toBeNull();
});
it("uses the existing PUT contract and server-returned paused state", async () => {
  status = { available: true, active: true, status: "active" };
  setup(
    <RentalDashboardShell active="today" title="Today">
      Fixture
    </RentalDashboardShell>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Pause TRACY" }));
  await screen.findByText("TRACY is paused");
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/agent/status") &&
          init?.method === "PUT" &&
          init.body === '{"active":false}',
      ),
  ).toBe(true);
});
it("never writes a late control response into another tenant cache", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useSetAgentStatus(), { wrapper });
  act(() => result.current.mutate(false));
  await waitFor(() => expect(finish).toBeTruthy());
  setClientSlug("ali-car-rental");
  setToken("other-token");
  await act(async () =>
    finish(json({ available: true, active: false, status: "paused" })),
  );
  expect(
    client.getQueryData(tenantKeyFor("ali-car-rental", "agent-status")),
  ).toBeUndefined();
});
it("requires verified refresh after a failed automation change", async () => {
  status = { available: true, active: true, status: "active" };
  setup(
    <RentalDashboardShell active="today" title="Today">
      Fixture
    </RentalDashboardShell>,
  );
  const pause = await screen.findByRole("button", { name: "Pause TRACY" });
  statusFailure = true;
  fireEvent.click(pause);
  await screen.findByRole("alert");
  expect(
    screen
      .getByRole("button", { name: "TRACY controls unavailable" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.queryByText("TRACY is active")).toBeNull();
  statusFailure = false;
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh automation status" }),
  );
  await screen.findByRole("button", { name: "Pause TRACY" });
});
it("never presents an unavailable attention API as an empty healthy queue", async () => {
  const implementation = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((url, init) =>
    String(url).endsWith("/isluno/operations/today")
      ? Promise.resolve(json({}, 503))
      : implementation(url, init),
  );
  setup(<MermaidToday />);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("No healthy or empty state can be confirmed"),
  );
  expect(
    screen.queryByText("No pending or failed journey actions recorded."),
  ).toBeNull();
});

it("shows the recovery API audit in the real shell without offering blind retries", async () => {
  const implementation = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((url, init) =>
    String(url).endsWith("/isluno/operations/today")
      ? Promise.resolve(json(recoveryToday))
      : implementation(url, init),
  );
  setup(<MermaidToday />);
  const region = await screen.findByRole("region", { name: "Recovery and cutover audit" });
  const audit = within(region);
  expect(audit.getByText("understanding failure")).toBeTruthy();
  expect(audit.getByText(/operator_review · RuntimeError/)).toBeTruthy();
  expect(audit.getByText(/Reminders: disabled/)).toBeTruthy();
  expect(audit.getAllByText(/ambiguous/).length).toBeGreaterThan(0);
  expect(audit.getByText(/suppressed · customer_reply/)).toBeTruthy();
  expect(audit.getByRole("link", { name: "Review saved itinerary" }).getAttribute("href")).toMatch(/^\/itineraries\//);
  expect(audit.getByRole("link", { name: "Open original Mermaid records" }).getAttribute("href")).toBe("/reservations?view=mermaid");
  expect(audit.getAllByText(/uncertain outcome reconcile no replay/).length).toBeGreaterThan(0);
  expect(audit.queryAllByRole("button")).toHaveLength(0);
  expect(vi.mocked(fetch).mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
});
