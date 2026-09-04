import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchConversation } from "@/lib/api";
import { EscalationReasonPanel } from "./EscalationReasonPanel";

const briefing = {
  reason:
    "The guest needs help boarding and leaving the boat. The Mermaid crew must assess the assistance available.",
  customerWants: "Assistance getting on and off the boat on Sunday.",
  operatorNeedsToDecide:
    "Confirm what boarding assistance the crew can safely provide.",
  latestCustomerMessage:
    "My partner needs special assistance on and off board. Can you help?",
  extractedDetails: { proposedTimes: ["sunday"] },
};

describe("Mermaid escalation reason panel", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "mermaid");
    localStorage.setItem("wtyj_token_mermaid", "synthetic-token");
  });
  it("renders the real API briefing even after an 'are you there?' follow-up, not a Sunday meeting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            escalationSummary: briefing,
            messages: [
              {
                role: "user",
                text: briefing.latestCustomerMessage,
                created_at: "2026-09-03T20:00:00Z",
              },
              {
                role: "assistant",
                text: "The crew will review your Sunday trip request.",
                created_at: "2026-09-03T20:01:00Z",
              },
              {
                role: "user",
                text: "Hello, why did you stop? Are you there?",
                created_at: "2026-09-03T20:02:00Z",
              },
            ],
          }),
          { status: 200, headers: { "X-Unboks-Tenant": "mermaid" } },
        ),
      ),
    );
    const detail = await fetchConversation("guest");
    const view = render(
      <EscalationReasonPanel
        mode="soft"
        summary={detail.escalationSummary}
        customerWants={detail.customerWants}
        operatorNeedsToDecide={detail.operatorNeedsToDecide}
        guestMessage={detail.escalationCustomerMessage}
        messages={detail.messages}
        proposedTimes={detail.extractedDetails?.proposedTimes}
      />,
    );
    expect(screen.getByText(briefing.reason)).toBeTruthy();
    expect(screen.getByText(briefing.customerWants)).toBeTruthy();
    expect(screen.getByText(briefing.operatorNeedsToDecide)).toBeTruthy();
    expect(screen.getByText(briefing.latestCustomerMessage)).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Crew decision needed" }),
    ).toBeTruthy();
    expect(view.container.textContent).not.toMatch(
      /meeting|choose a slot|confirm sunday|08:00/i,
    );
  });
  it.each(["soft", "hard"] as const)(
    "does not infer a meeting from a sailing day when the reason is missing (%s)",
    (mode) => {
      const view = render(
        <EscalationReasonPanel
          mode={mode}
          proposedTimes={["Sunday", "08:00"]}
          messages={[
            {
              id: "1",
              role: "user",
              content: "Is the Sunday boat trip still going?",
              timestamp: "",
              timestampMs: 1,
            },
          ]}
        />,
      );
      expect(view.container.textContent).toContain("Mermaid");
      expect(view.container.textContent).not.toMatch(
        /meeting|choose.*slot|confirm Sunday at 08:00/i,
      );
      expect(
        screen.getByText(/specific escalation reason has not been provided/),
      ).toBeTruthy();
    },
  );
  it("leaves other tenants on their existing briefing and labels", () => {
    sessionStorage.setItem("unboks_active_tenant", "unboks");
    render(
      <EscalationReasonPanel
        mode="soft"
        summary="Approved general tenant reason"
        customerWants="An activation meeting"
        operatorNeedsToDecide="Choose the agreed activation time"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Decision needed" }),
    ).toBeTruthy();
    expect(screen.getByText("An activation meeting")).toBeTruthy();
    expect(screen.queryByText("Crew decision needed")).toBeNull();
  });
  it("renders guest text safely as text, never executable markup", () => {
    render(
      <EscalationReasonPanel
        mode="soft"
        guestMessage={'<img src=x onerror="alert(1)">'}
      />,
    );
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });
});
