import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import * as api from "@/lib/api";
import type { MermaidCrewAssistance } from "@/lib/api";
import {
  MermaidCrewAssistanceBadge,
  MermaidCrewAssistanceCard,
} from "./MermaidCrewAssistance";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    acknowledgeMermaidCrewAssistance: vi.fn(),
  };
});

const note: MermaidCrewAssistance = {
  id: "assist-1",
  kind: "wheelchair",
  note: "Guest's mother uses a folding wheelchair.",
  relationship: "Guest's mother",
  tripDate: "2026-09-19",
  reservationPublicId: "mer-1",
  status: "unacknowledged",
  revision: 3,
  createdAt: "2026-09-04T12:00:00Z",
  updatedAt: "2026-09-04T12:05:00Z",
  acknowledgedAt: null,
  acknowledgedBy: null,
};

function mount(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

describe("Mermaid crew assistance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "mermaid");
  });

  it("shows the operational detail and records an explicit operator acknowledgement", async () => {
    vi.mocked(api.acknowledgeMermaidCrewAssistance).mockResolvedValue({
      ...note,
      status: "acknowledged",
      acknowledgedAt: "2026-09-04T12:10:00Z",
      acknowledgedBy: "Jr",
    });
    mount(
      <MermaidCrewAssistanceCard
        item={note}
        customerName="Alex Guest"
        conversationId="guest-1"
        showLinks
      />,
    );

    expect(screen.getByText(note.note)).toBeTruthy();
    expect(screen.getByText("Guest's mother")).toBeTruthy();
    expect(screen.getByText(/Sep 19/)).toBeTruthy();
    expect(api.acknowledgeMermaidCrewAssistance).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Full conversation" }).getAttribute(
        "href",
      ),
    ).toBe("/conversations?c=guest-1");
    fireEvent.change(
      screen.getByLabelText("Operator acknowledging wheelchair assistance"),
      { target: { value: "Jr" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));

    await waitFor(() =>
      expect(api.acknowledgeMermaidCrewAssistance).toHaveBeenCalledWith(
        "assist-1",
        3,
        "Jr",
      ),
    );
  });

  it("keeps a failed acknowledgement visibly open", async () => {
    vi.mocked(api.acknowledgeMermaidCrewAssistance).mockRejectedValue(
      new Error("stale revision"),
    );
    mount(<MermaidCrewAssistanceCard item={note} />);

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(
      await screen.findByText(/Acknowledgement was not recorded/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeTruthy();
    expect(screen.getByText(note.note)).toBeTruthy();
  });

  it("retains an acknowledged note with who and when, without another action", () => {
    mount(
      <MermaidCrewAssistanceCard
        item={{
          ...note,
          status: "acknowledged",
          acknowledgedAt: "2026-09-04T12:10:00Z",
          acknowledgedBy: "Calvin",
        }}
      />,
    );

    expect(screen.getByText(note.note)).toBeTruthy();
    expect(screen.getByText(/Acknowledged by Calvin/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Acknowledge" }),
    ).toBeNull();
  });

  it("renders the corrected current note and date in place", () => {
    const view = mount(<MermaidCrewAssistanceCard item={note} />);
    view.rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MermaidCrewAssistanceCard
          item={{
            ...note,
            note: "Correction: compact chair; guest can transfer independently.",
            tripDate: "2026-09-26",
            revision: 4,
          }}
        />
      </QueryClientProvider>,
    );

    expect(screen.queryByText(note.note)).toBeNull();
    expect(
      screen.getByText(
        "Correction: compact chair; guest can transfer independently.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Sep 26/)).toBeTruthy();
  });

  it("labels ordinary boarding help distinctly from a wheelchair note", () => {
    const boardingNote: MermaidCrewAssistance = {
      ...note,
      id: "assist-boarding",
      kind: "boarding_assistance",
      note: "Guest requested extra help getting on and off the boat.",
      relationship: "Guest's husband",
    };
    mount(
      <>
        <MermaidCrewAssistanceBadge item={boardingNote} />
        <MermaidCrewAssistanceCard item={boardingNote} />
      </>,
    );

    expect(screen.getAllByText("Boarding assistance")).toHaveLength(2);
    expect(
      screen.getByLabelText("Operator acknowledging boarding assistance"),
    ).toBeTruthy();
    expect(screen.getByText(boardingNote.note)).toBeTruthy();
  });
});
