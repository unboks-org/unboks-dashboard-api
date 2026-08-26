import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  canShowEscalationHeaderResolve,
  EscalationHeaderResolveButton,
} from "./EscalationHeaderResolveButton";

describe("EscalationHeaderResolveButton", () => {
  it("exposes a clear Resolve action and invokes it once", () => {
    const onResolve = vi.fn();
    render(
      <EscalationHeaderResolveButton
        onResolve={onResolve}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Resolve escalation" }));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Resolve")).toBeTruthy();
  });

  it("disables the action and shows honest pending copy", () => {
    const onResolve = vi.fn();
    render(
      <EscalationHeaderResolveButton
        onResolve={onResolve}
        pending
      />,
    );

    const button = screen.getByRole("button", { name: "Resolve escalation" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Resolving...")).toBeTruthy();
    fireEvent.click(button);
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("shows only for active soft or hard escalations with a stable id", () => {
    const base = {
      activeEscalation: true,
      archived: false,
      resolved: false,
      mode: "soft" as const,
      escalationId: "esc-123",
    };

    expect(canShowEscalationHeaderResolve(base)).toBe(true);
    expect(canShowEscalationHeaderResolve({ ...base, mode: "hard" })).toBe(true);
    expect(canShowEscalationHeaderResolve({ ...base, mode: "order" })).toBe(false);
    expect(canShowEscalationHeaderResolve({ ...base, archived: true })).toBe(false);
    expect(canShowEscalationHeaderResolve({ ...base, resolved: true })).toBe(false);
    expect(canShowEscalationHeaderResolve({ ...base, activeEscalation: false })).toBe(false);
    expect(canShowEscalationHeaderResolve({ ...base, escalationId: null })).toBe(false);
  });
});
