import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IslunoRecovery } from "./IslunoRecovery";

describe("Isluno recovery", () => {
  it("makes a discovery-only partial failure actionable without replay controls", () => {
    render(<IslunoRecovery data={{
      reminders_enabled: false, incidents: [], reminders: [],
      outbound_failures: [{ id: "fixture-plan", status: "rejected", provider_id: null,
        inbox_path: "/conversations?c=scoped%2Ffixture", reason: "invalid_body", http_status: 400,
        parts: [{ index: 0, status: "accepted" }, { index: 1, status: "rejected", http_status: 400 }],
      }], legacy: { activated_at: null, quarantined: [] },
    }} />);
    expect(screen.getByRole("link", { name: "Open conversation" }).getAttribute("href")).toBe("/conversations?c=scoped%2Ffixture");
    expect(screen.getByText("Part 1: accepted")).toBeTruthy();
    expect(screen.getByText(/Part 2: rejected/)).toBeTruthy();
    expect(screen.getByText(/invalid body/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /retry|resend|replay/i })).toBeNull();
  });
});
