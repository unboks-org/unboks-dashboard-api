import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { setClientSlug, setToken } from "@/lib/tenant";
import {
  IslunoOperationsGate,
  IslunoJourneysPage,
  IslunoJourneyRoute,
} from "./IslunoOperations";
import fixture from "../../../tests/isluno-operations.fixture.json";
vi.mock("@/components/inbox/DashboardShell", () => ({
  DashboardShell: ({
    children,
    searchQuery,
    onSearchChange,
  }: {
    children: ReactNode;
    searchQuery?: string;
    onSearchChange?: (s: string) => void;
  }) => (
    <>
      {onSearchChange && (
        <label>
          Search
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </label>
      )}
      {children}
    </>
  ),
}));
const json = (data: unknown, status = 200, tenant = "mermaid") =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "X-Unboks-Tenant": tenant, "Content-Type": "application/json" },
  });
beforeEach(() => {
  setClientSlug("mermaid");
  setToken("fixture-token");
  window.history.replaceState(null, "", "/reservations");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/isluno/capabilities"))
        return json({
          enabled: true,
          tenant_slug: "mermaid",
          capabilities: { itinerary_workspace: true },
        });
      if (url.includes("/journeys?")) return json(fixture.listing);
      if (url.endsWith("/journeys/" + fixture.detail.id))
        return json(fixture.detail);
      if (url.includes("/guests?")) return json(fixture.guests);
      throw new Error("External/unexpected request denied");
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, refetchOnWindowFocus: false },
          },
        })
      }
    >
      <Switch>
        <Route path="/reservations">
          <IslunoOperationsGate legacy={<p>Original Mermaid records</p>}>
            <IslunoJourneysPage />
          </IslunoOperationsGate>
        </Route>
        <Route path="/itineraries/:journeyId">
          <IslunoJourneyRoute />
        </Route>
        <Route path="/customers">
          <IslunoOperationsGate legacy={<p>Original Mermaid guests</p>}>
            <IslunoJourneysPage guestView />
          </IslunoOperationsGate>
        </Route>
      </Switch>
    </QueryClientProvider>,
  );
}
it("renders one/multiple trip parents from authenticated API and routes to immutable detail", async () => {
  mount();
  await screen.findByText("Second Party");
  expect(screen.getAllByText(/1 trip ·/)).toHaveLength(2);
  expect(screen.getByText(/2 trips ·/)).toBeTruthy();
  const link = screen
    .getAllByText("Open itinerary")
    .find((el) => el.getAttribute("href")?.includes(fixture.detail.id))!;
  fireEvent.click(link);
  await screen.findByText("2 trips · USD 500.00 · Revision 5");
  expect(screen.getAllByText("Demo paid · ticket issued")).toHaveLength(2);
  expect(screen.getByText("Guest: Calvin · Ages 35, 34, 8")).toBeTruthy();
  expect(screen.getByText("Guest: Second Party · Ages 35, 34, 8")).toBeTruthy();
  expect(screen.getByText("Open inbox / takeover").getAttribute("href")).toBe(
    fixture.detail.inbox_path,
  );
  expect(
    vi
      .mocked(fetch)
      .mock.calls.every(([, init]) => !init?.method || init.method === "GET"),
  ).toBe(true);
});
it("shows corrected quote versions, server stages and ambiguous acceptance without inventing delivery", async () => {
  window.history.replaceState(null, "", "/itineraries/" + fixture.detail.id);
  mount();
  await screen.findByText("Demo paid");
  fireEvent.click(screen.getByText("Quotes"));
  expect(screen.getByText("Quote version 1 · superseded")).toBeTruthy();
  expect(screen.getByText("Quote version 2 · approved")).toBeTruthy();
  fireEvent.click(screen.getByText("Delivery"));
  expect(screen.getAllByText("ambiguous")).toHaveLength(2);
  const oldParts = screen
    .getAllByRole("heading", { name: "Quote version 1 · superseded" })
    .map((el) => el.parentElement!);
  const currentParts = screen
    .getAllByRole("heading", { name: "Quote version 2 · approved" })
    .map((el) => el.parentElement!);
  expect(oldParts.some((el) => within(el).queryByText("ambiguous"))).toBe(true);
  expect(
    currentParts.some((el) => within(el).queryByText("Accepted by provider")),
  ).toBe(true);
  for (const part of [...oldParts, ...currentParts]) {
    expect(within(part).getByText(/Quote reference:/)).toBeTruthy();
    expect(within(part).getByText(/Part \d+ of \d+/)).toBeTruthy();
  }
  expect(
    currentParts.some((el) =>
      within(el).queryByText(/ticket reference:.*Trip/),
    ),
  ).toBe(true);
  expect(screen.getAllByText("Accepted by provider").length).toBeGreaterThan(0);
  expect(screen.getAllByText("queued").length).toBeGreaterThan(0);
  expect(
    screen.queryByRole("button", { name: /resend|mark paid|approve/i }),
  ).toBeNull();
  fireEvent.click(screen.getByText("History"));
  expect(screen.getByText("Demo payment completed")).toBeTruthy();
});
it("keeps cached detail visible on partial refresh failure", async () => {
  window.history.replaceState(null, "", "/itineraries/" + fixture.detail.id);
  mount();
  await screen.findByText("Demo paid");
  vi.mocked(fetch).mockResolvedValueOnce(json({}, 503));
  fireEvent.click(screen.getByText("Refresh"));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Previously loaded details"),
  );
  expect(screen.getAllByText("Demo paid · ticket issued")).toHaveLength(2);
});
it("renders server-side guest workspaces and preserves legacy selection", async () => {
  mount();
  await screen.findByText("Second Party");
  fireEvent.click(screen.getByText("Guest workspaces"));
  await screen.findByText("3 guests found");
  expect(screen.getAllByText("Open guest history")).toHaveLength(3);
  fireEvent.click(screen.getByText("Legacy Mermaid records"));
  expect(await screen.findByText("Original Mermaid guests")).toBeTruthy();
});
it("shows loading and empty search with no invented counts", async () => {
  let resolve!: (r: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  mount();
  expect(screen.getByRole("status").textContent).toContain("Loading journey");
  resolve(
    json({
      enabled: true,
      tenant_slug: "mermaid",
      capabilities: { itinerary_workspace: true },
    }),
  );
  await screen.findByText("Second Party");
  vi.mocked(fetch).mockResolvedValueOnce(
    json({ items: [], total: 0, next_offset: null }),
  );
  fireEvent.change(screen.getByLabelText("Search"), {
    target: { value: "absent" },
  });
  expect(
    await screen.findByText("No itineraries match this search."),
  ).toBeTruthy();
});
it("tenant switching rejects late responses and never renders the previous tenant detail", async () => {
  let resolve!: (r: Response) => void;
  vi.mocked(fetch).mockImplementation(async (url: string) =>
    url.includes("/capabilities")
      ? json({
          enabled: true,
          tenant_slug: "mermaid",
          capabilities: { itinerary_workspace: true },
        })
      : new Promise((r) => {
          resolve = r;
        }),
  );
  mount();
  await screen.findByText("Loading itineraries…");
  setClientSlug("other");
  setToken("other-token");
  resolve(json(fixture.listing));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("Second Party")).toBeNull();
});
