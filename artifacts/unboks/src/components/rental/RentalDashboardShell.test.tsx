import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasRentalBackHistory,
  rentalNavigationState,
} from "@/lib/rental-navigation-history";
import { RentalDashboardShell } from "./RentalDashboardShell";

vi.mock("@/components/auth/useAuth", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock("@/hooks/use-client-profile", () => ({
  useClientProfile: () => ({ data: { name: "Ali Car Rental" } }),
}));

vi.mock("@/hooks/use-agent-status", () => ({
  useAgentStatus: () => ({
    data: { available: true, active: true },
    isLoading: false,
  }),
  useSetAgentStatus: () => ({ isPending: false, mutate: vi.fn() }),
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

describe("RentalDashboardShell back navigation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    window.history.replaceState({}, "", "/today");
  });

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
