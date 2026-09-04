import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MermaidReservationSummary } from "@/lib/api";
import MermaidReservations from "./MermaidReservations";

const state = vi.hoisted(() => ({
  data: undefined as MermaidReservationSummary[] | undefined,
  isError: false,
}));
vi.mock("@/components/inbox/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ ...state, isLoading: false, refetch: vi.fn() }),
}));

describe("Mermaid reservation pipeline", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/reservations");
    state.data = [];
    state.isError = false;
  });

  it("shows zero only for an actual empty response", () => {
    render(<MermaidReservations />);
    expect(screen.getAllByText("0")).toHaveLength(4);
    expect(screen.queryByText("—")).toBeNull();
  });

  it("does not turn an unavailable reservation service into zero metrics", () => {
    state.data = undefined;
    state.isError = true;
    render(<MermaidReservations />);
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  it("keeps the wheelchair marker after acknowledgement and only queues unacknowledged notes", () => {
    const reservation = (
      publicId: string,
      customerName: string,
      status: "unacknowledged" | "acknowledged",
    ) =>
      ({
        publicId,
        conversationId: `conversation-${publicId}`,
        customerName,
        language: "en",
        tripDate: "2026-09-19",
        adults: 2,
        children: 0,
        infants: 0,
        pickupPreference: "pier",
        catalogVersion: "catalog-v1",
        currency: "USD",
        total: 300,
        items: [],
        state: "booked",
        stage: "booked",
        availabilitySource: "demo_assumed",
        humanTakeover: false,
        revision: 4,
        createdAt: "2026-09-04T12:00:00Z",
        updatedAt: "2026-09-04T12:10:00Z",
        primaryAction: null,
        demo: true,
        crewAssistance: {
          id: `assist-${publicId}`,
          kind: "wheelchair",
          note: "Folding wheelchair",
          relationship: "Guest's mother",
          tripDate: "2026-09-19",
          reservationPublicId: publicId,
          status,
          revision: 2,
          createdAt: "2026-09-04T12:00:00Z",
          updatedAt: "2026-09-04T12:05:00Z",
          acknowledgedAt:
            status === "acknowledged" ? "2026-09-04T12:05:00Z" : null,
          acknowledgedBy: status === "acknowledged" ? "Calvin" : null,
        },
      }) as MermaidReservationSummary;
    state.data = [
      reservation("mer-1", "Needs acknowledgement", "unacknowledged"),
      reservation("mer-2", "Already acknowledged", "acknowledged"),
    ];

    render(<MermaidReservations />);
    expect(screen.getAllByLabelText(/Wheelchair assistance/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Needs crew" }));
    expect(screen.getByText("Needs acknowledgement")).toBeTruthy();
    expect(screen.queryByText("Already acknowledged")).toBeNull();
  });
});
