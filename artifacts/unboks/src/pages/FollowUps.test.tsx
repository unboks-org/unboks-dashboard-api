import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FollowUps from "@/pages/FollowUps";

const api = vi.hoisted(() => ({
  fetchQuoteLeads: vi.fn(),
  fetchFollowUps: vi.fn(),
  fetchAliDossierConfiguration: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/followups", vi.fn()],
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/inbox/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

vi.mock("@/components/ali/AliCustomerFile", () => ({
  AliCustomerFile: () => <section>Customer file</section>,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    archiveConversation: vi.fn(),
    confirmAliReservation: vi.fn(),
    decideAliReservationAvailability: vi.fn(),
    fetchAliDossierConfiguration: api.fetchAliDossierConfiguration,
    fetchFollowUps: api.fetchFollowUps,
    fetchQuoteLeads: api.fetchQuoteLeads,
    updateAliReservationChecklist: vi.fn(),
    updateFollowUpStatus: vi.fn(),
  };
});

const completeLead = {
  id: "conversation-1",
  conversation_id: "conversation-1",
  channel: "whatsapp",
  customer_name: "Calvin Adamus",
  first_name: "Calvin Adamus",
  surnames: "",
  phone_raw: "WhatsApp ••••0000",
  callback_preference: "",
  pickup_datetime: "2026-09-01",
  return_datetime: "2026-09-04",
  pickup_location: "Airport",
  return_location: "Airport",
  driver_age: 30,
  passenger_count: 2,
  vehicle_preference: "Compact Car",
  visit_reason: "",
  handoff_reason: "Review and answer the customer conversation.",
  created_at: "2026-08-27T06:00:00Z",
  updated_at: "2026-08-27T06:11:34Z",
  complete: true,
  missing_fields: [],
  required_fields: [],
  field_labels: {},
  quote_delivery_state: "delivered" as const,
  status: "needs_an_answer" as const,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <FollowUps />
    </QueryClientProvider>,
  );
}

describe("Quote Leads status contract", () => {
  beforeEach(() => {
    sessionStorage.clear();
    api.fetchQuoteLeads.mockReset();
    api.fetchFollowUps.mockReset();
    api.fetchAliDossierConfiguration.mockReset();
    api.fetchAliDossierConfiguration.mockResolvedValue({
      enabled: false,
      ready: false,
      configurationReady: false,
      blockers: [],
    });
  });

  it("shows an Ali needs_an_answer lead and its post-quote panel", async () => {
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    api.fetchQuoteLeads.mockResolvedValue([completeLead]);

    renderPage();

    expect((await screen.findAllByText("Calvin Adamus")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Active 1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Needs an answer 1/ })).toBeTruthy();
    expect(screen.getByText("Post-quote reservation")).toBeTruthy();
    expect(screen.queryByText("No quote leads in this view.")).toBeNull();
  });

  it("preserves the existing non-rental needs_human_answer status", async () => {
    sessionStorage.setItem("unboks_active_tenant", "consulta-despertares");
    api.fetchFollowUps.mockResolvedValue([
      {
        ...completeLead,
        status: "needs_human_answer",
      },
    ]);

    renderPage();

    expect((await screen.findAllByText("Calvin Adamus")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Activos 1/ })).toBeTruthy();
    expect(screen.queryByText("Post-quote reservation")).toBeNull();
  });
});
