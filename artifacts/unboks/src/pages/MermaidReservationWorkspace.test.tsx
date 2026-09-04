import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MermaidReservationDetail } from "@/lib/api";
import { mermaidReceiptFixture } from "@/test/mermaid-receipt-fixture";
import MermaidReservationWorkspace from "./MermaidReservationWorkspace";

vi.mock("@/components/mermaid/MermaidAttentionQueue", () => ({
  MermaidReservationAttention: () => null,
}));
vi.mock("@/components/mermaid/MermaidCrewAssistance", () => ({
  MermaidCrewAssistanceBadge: () => <span>Wheelchair assistance</span>,
  MermaidCrewAssistanceCard: ({
    item,
  }: {
    item: MermaidReservationDetail["crewAssistance"];
  }) => <section>{item?.note}</section>,
}));
vi.mock("@/hooks/use-mermaid-attention", () => ({
  useMermaidAttention: () => ({ items: [], complete: true }),
}));

const state = vi.hoisted(() => ({
  item: undefined as MermaidReservationDetail | undefined,
  navigate: vi.fn(),
}));
vi.mock("wouter", () => ({
  useParams: () => ({ reservationId: "synthetic-reservation" }),
  useLocation: () => ["/reservations/synthetic-reservation", state.navigate],
}));
vi.mock("@/components/inbox/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: state.item, isError: false }),
}));

describe("Mermaid receipt printing", () => {
  beforeEach(() => {
    state.item = structuredClone(mermaidReceiptFixture);
    state.navigate.mockReset();
    vi.spyOn(window, "print").mockImplementation(() => {});
  });

  it("replaces the evidence link with a print-dialog action and allows reprinting", () => {
    render(<MermaidReservationWorkspace />);
    expect(
      screen.queryByRole("button", { name: "View receipt evidence" }),
    ).toBeNull();
    const button = screen.getByRole("button", { name: "Print receipt" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(window.print).toHaveBeenCalledTimes(2);
    expect(state.navigate).not.toHaveBeenCalled();
  });

  it("shows an exact supplied infant age in the reservation and printable receipt", () => {
    state.item!.partyDescription = "3 adults · 1 infant (9 months)";
    render(<MermaidReservationWorkspace />);
    expect(
      screen.getAllByText("3 adults · 1 infant (9 months)").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      document.querySelector(".mermaid-print-receipt")?.textContent,
    ).toContain("1 infant (9 months)");
    expect(
      document.querySelector(".mermaid-print-receipt")?.textContent,
    ).not.toContain("little one");
  });

  it("prints the captured receipt amounts and operator details, not chat history", () => {
    render(<MermaidReservationWorkspace />);
    const paper = document.querySelector<HTMLElement>(
      ".mermaid-print-receipt",
    )!;
    expect(paper.parentElement).toBe(document.body);
    expect(paper.style.display).toBe("none");
    expect(paper.textContent).toContain("DEMO-PRINT-001");
    expect(paper.textContent).toContain("USD 375.00");
    expect(paper.textContent).toContain("Alex Example");
    expect(paper.textContent).toContain("2026");
    expect(paper.textContent).toContain("1 child (4-12)");
    expect(paper.textContent).toContain("synthetic-receipt-001");
    expect(paper.textContent).toContain("One vegetarian meal");
    expect(paper.textContent).toContain("NOT PROOF OF PAYMENT");
    expect(paper.textContent).not.toContain("Private conversation text");
    expect(within(paper).getAllByRole("row", { hidden: true })).toHaveLength(4);
  });

  it("keeps the wheelchair marker after booking but excludes its private note from print", () => {
    state.item!.accessibilityNotes =
      "Guest's mother uses a folding wheelchair.";
    state.item!.crewAssistance = {
      id: "assist-1",
      kind: "wheelchair",
      note: "Guest's mother uses a folding wheelchair.",
      relationship: "Guest's mother",
      tripDate: "2026-09-12",
      reservationPublicId: "synthetic-reservation",
      status: "acknowledged",
      revision: 4,
      createdAt: "2026-09-04T12:00:00Z",
      updatedAt: "2026-09-04T12:10:00Z",
      acknowledgedAt: "2026-09-04T12:10:00Z",
      acknowledgedBy: "Calvin",
    };

    render(<MermaidReservationWorkspace />);
    expect(screen.getAllByText("Wheelchair assistance")).toHaveLength(1);
    expect(
      screen.getByText("Guest's mother uses a folding wheelchair."),
    ).toBeTruthy();
    const paper = document.querySelector<HTMLElement>(
      ".mermaid-print-receipt",
    )!;
    expect(paper.textContent).not.toContain("wheelchair");
    expect(paper.textContent).not.toContain("Accessibility");
  });

  it.each([
    { receiptPublicId: null },
    { bookingCode: null },
    { stage: "cancelled" as const },
    { stage: "payment" as const },
  ])("does not print a missing or unconfirmed receipt: %s", (patch) => {
    Object.assign(state.item!, patch);
    render(<MermaidReservationWorkspace />);
    const button = screen.getByRole("button", {
      name: "Print receipt",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(window.print).not.toHaveBeenCalled();
    expect(document.querySelector(".mermaid-print-receipt")).toBeNull();
  });

  it("preserves other reservation actions", () => {
    state.item!.stage = "payment";
    state.item!.primaryAction = {
      id: "open_conversation",
      label: "Open conversation",
      href: "/conversations",
    };
    render(<MermaidReservationWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Open conversation" }));
    expect(state.navigate).toHaveBeenCalledWith(
      "/conversations?c=synthetic-guest-contact",
    );
    expect(window.print).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "keeps receipt printing available when a booked journey has a handover action: %s",
    (hasHandoverAction) => {
      state.item!.humanTakeover = true;
      state.item!.primaryAction = hasHandoverAction
        ? {
            id: "open_conversation",
            label: "Continue as human",
            href: "/conversations",
          }
        : null;
      render(<MermaidReservationWorkspace />);
      fireEvent.click(screen.getByRole("button", { name: "Print receipt" }));
      expect(window.print).toHaveBeenCalledTimes(1);
      expect(state.navigate).not.toHaveBeenCalled();
      if (hasHandoverAction) {
        fireEvent.click(
          screen.getByRole("button", { name: "Continue as human" }),
        );
        expect(state.navigate).toHaveBeenCalledWith(
          "/conversations?c=synthetic-guest-contact",
        );
      }
    },
  );

  it("escapes guest content and removes print-only styles when leaving the page", () => {
    state.item!.customerName = '<img src=x onerror="alert(1)">';
    const { unmount } = render(<MermaidReservationWorkspace />);
    const paper = document.querySelector(".mermaid-print-receipt")!;
    expect(paper.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(paper.querySelector("img")).toBeNull();
    unmount();
    expect(document.querySelector(".mermaid-print-receipt")).toBeNull();
  });
});
