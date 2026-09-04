import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasRentalBackHistory,
  rentalNavigationState,
} from "@/lib/rental-navigation-history";
import { RentalDashboardShell } from "./RentalDashboardShell";

const { agentQuery, mutateAgent } = vi.hoisted(() => ({
  agentQuery: {
    data: undefined as { available: boolean; active: boolean | null } | undefined,
    isLoading: false,
    isError: false,
  },
  mutateAgent: vi.fn(),
}));

vi.mock("@/components/auth/useAuth", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock("@/hooks/use-client-profile", () => ({
  useClientProfile: () => ({ data: { name: "Ali Car Rental" } }),
}));

vi.mock("@/hooks/use-agent-status", () => ({
  useAgentStatus: () => agentQuery,
  useSetAgentStatus: () => ({ isPending: false, mutate: mutateAgent }),
}));

function renderShell(active = "today") {
  return render(
    <RentalDashboardShell
      active={active}
      title="Today"
      subtitle="Rental operation"
    >
      <div style={{ height: 1600 }}>Dashboard content</div>
    </RentalDashboardShell>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
  window.history.replaceState({}, "", "/today");
  agentQuery.data = { available: true, active: true };
  agentQuery.isLoading = false;
  agentQuery.isError = false;
  mutateAgent.mockReset();
});

describe("RentalDashboardShell back navigation", () => {

  it("shows Back for an internal rental destination and uses browser history", () => {
    window.history.replaceState(
      rentalNavigationState("ali-car-rental"),
      "",
      "/today",
    );
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    renderShell();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Back to previous dashboard page",
      }),
    );

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("marks side-menu destinations with same-tenant back history", () => {
    renderShell();

    fireEvent.click(screen.getAllByRole("button", { name: "Customers" })[0]);

    expect(window.location.pathname).toBe("/customers");
    expect(hasRentalBackHistory("ali-car-rental")).toBe(true);
  });

  it("does not add duplicate history when the active menu item is selected", () => {
    renderShell();
    const before = window.history.length;

    fireEvent.click(screen.getAllByRole("button", { name: "Today" })[0]);

    expect(window.location.pathname).toBe("/today");
    expect(window.history.length).toBe(before);
  });
});

describe("RentalDashboardShell agent controls", () => {
  beforeEach(() => {
    sessionStorage.setItem("unboks_active_tenant", "mermaid");
  });

  it("does not change agent state on mount or when its status is clicked", () => {
    renderShell();
    expect(mutateAgent).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByText("TRACY is active")[0]);

    expect(mutateAgent).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "TRACY is active" })).toBeNull();
  });

  it("pauses only through the explicit Pause TRACY action", () => {
    renderShell();

    fireEvent.click(screen.getAllByRole("button", { name: "Pause TRACY" })[0]);

    expect(mutateAgent).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("shows an explicit pause and Resume action only for a known false state", () => {
    agentQuery.data = { available: true, active: false };
    renderShell();

    expect(screen.getAllByText("TRACY is paused").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Resume TRACY" })[0]);
    expect(mutateAgent).toHaveBeenCalledExactlyOnceWith(true);
  });

  it.each([
    ["a failed first request", undefined, true],
    ["a bridge-unavailable response", { available: false, active: false }, false],
    ["an unknown state", { available: true, active: null }, false],
    ["a failed refetch with cached active state", { available: true, active: true }, true],
  ])("does not label %s as paused or enable state changes", (_name, data, isError) => {
    agentQuery.data = data;
    agentQuery.isError = isError;
    renderShell();

    expect(screen.getAllByText("TRACY status unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText("TRACY is paused")).toBeNull();
    const control = screen.getAllByRole("button", { name: "TRACY controls unavailable" })[0];
    expect((control as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(control);
    expect(mutateAgent).not.toHaveBeenCalled();
  });
});
