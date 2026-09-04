import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactNode } from "react";
import * as api from "@/lib/api";
import MermaidCustomerAccount from "./MermaidCustomerAccount";
import MermaidCustomers from "./MermaidCustomers";

vi.mock("@/components/inbox/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/lib/api", () => ({
  fetchMermaidCustomer: vi.fn(),
  fetchMermaidCustomers: vi.fn(),
  fetchMermaidCustomerHistory: vi.fn(),
  fetchMermaidCustomerDocument: vi.fn(),
}));
const account = {
  id: 1,
  customerName: "Test Guest",
  conversationId: "conversation-a",
  firstSeen: "2026-09-03T12:00:00Z",
  lastSeen: "2026-09-03T12:00:00Z",
  messageCount: 2,
  reservationCount: 0,
  details: {
    customer_name: "Test Guest",
    contact_phone: "+12025550123",
    adults: 0,
    special_requests: "A quiet spot\nNear the shade",
  },
  reservations: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchMermaidCustomer).mockResolvedValue(account);
  vi.mocked(api.fetchMermaidCustomers).mockResolvedValue({
    items: [account],
    nextOffset: null,
  });
  vi.mocked(api.fetchMermaidCustomerHistory).mockImplementation(
    async (_id, before, changes) =>
      changes
        ? ({
            items: [
              {
                id: 9,
                details: { contact_phone: "+12025550999" },
                createdAt: "2026-09-02T12:00:00Z",
              },
            ],
            nextBefore: null,
          } as never)
        : ({
            items: [
              {
                id: before ? 1 : 2,
                text: before ? "Earlier enquiry" : "Hello\n\nWelcome",
                role: "user",
                created_at: "2026-09-03T12:00:00Z",
                sender_name: "Test Guest",
                channel: "whatsapp",
              },
            ],
            nextBefore: before ? null : 2,
          } as never),
  );
});
function mount(path: string) {
  const location = memoryLocation({ path });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Router hook={location.hook}>
        <Route path="/customers/:reservationId">
          <MermaidCustomerAccount />
        </Route>
        <Route path="/customers">
          <MermaidCustomers />
        </Route>
      </Router>
    </QueryClientProvider>,
  );
  return location;
}
it("opens a pre-booking customer and preserves paragraphs, zeros and earlier history", async () => {
  mount("/customers");
  fireEvent.click(await screen.findByRole("link", { name: /Test Guest/ }));
  expect(
    (await screen.findByRole("link", { name: "+12025550123" })).getAttribute(
      "href",
    ),
  ).toBe("tel:+12025550123");
  expect(screen.getByText("0")).toBeTruthy();
  expect(screen.getByText(/No booking yet/)).toBeTruthy();
  const text = await screen.findByText(
    (_, el) => el?.tagName === "P" && el.textContent === "Hello\n\nWelcome",
  );
  expect(text.className).toContain("whitespace-pre-wrap");
  fireEvent.click(
    screen.getByRole("button", { name: "Load earlier messages" }),
  );
  expect(await screen.findByText("Earlier enquiry")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Detail changes" }));
  expect(await screen.findByText("+12025550999")).toBeTruthy();
});
it("shows a recoverable error without inventing a customer record", async () => {
  vi.mocked(api.fetchMermaidCustomer).mockRejectedValue(new Error("offline"));
  mount("/customers/1");
  expect(await screen.findByText("Customer account unavailable")).toBeTruthy();
  vi.mocked(api.fetchMermaidCustomer).mockResolvedValue(account);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.getByRole("link", { name: "+12025550123" })).toBeTruthy(),
  );
});
