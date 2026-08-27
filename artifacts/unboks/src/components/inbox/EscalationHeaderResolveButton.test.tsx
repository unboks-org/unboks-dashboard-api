import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  canShowEscalationHeaderResolve,
  EscalationHeaderResolveButton,
  resolveEscalationRenderState,
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

  it("trusts an active escalation row when detail omits escalation state", () => {
    const state = resolveEscalationRenderState({
      detailEscalated: false,
      detailResolved: false,
      detailMode: null,
      rowEscalated: true,
      rowResolved: false,
      rowEscalationId: "sofia-soft-escalation",
      rowMode: "soft",
      matchedEscalationId: null,
    });

    expect(state).toEqual({
      active: true,
      escalationId: "sofia-soft-escalation",
      mode: "soft",
    });
    expect(canShowEscalationHeaderResolve({
      activeEscalation: state.active,
      archived: false,
      resolved: false,
      mode: state.mode,
      escalationId: state.escalationId,
    })).toBe(true);
  });

  it("uses the active-list match when a plain inbox row lacks escalation fields", () => {
    expect(resolveEscalationRenderState({
      detailEscalated: undefined,
      detailResolved: undefined,
      rowEscalated: false,
      rowResolved: false,
      matchedEscalationId: "active-list-id",
      rowMode: null,
      detailMode: "hard",
    })).toEqual({
      active: true,
      escalationId: "active-list-id",
      mode: "hard",
    });
  });

  it("fails closed for resolved rows and ordinary conversations", () => {
    expect(resolveEscalationRenderState({
      detailEscalated: true,
      detailResolved: false,
      rowEscalated: true,
      rowResolved: true,
      rowEscalationId: "resolved-id",
      rowMode: "soft",
    }).active).toBe(false);

    expect(resolveEscalationRenderState({
      detailEscalated: false,
      detailResolved: false,
      rowEscalated: false,
      rowResolved: false,
      rowMode: null,
    })).toEqual({
      active: false,
      escalationId: null,
      mode: null,
    });
  });
});
