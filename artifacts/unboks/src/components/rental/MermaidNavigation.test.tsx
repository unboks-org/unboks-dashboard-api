import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isMermaidReservationTenant,
  isRentalDashboardV2Enabled,
} from "@/lib/tenant-ui";
import { RentalDashboardShell } from "./RentalDashboardShell";

vi.mock("@/components/auth/useAuth", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));
vi.mock("@/hooks/use-client-profile", () => ({
  useClientProfile: () => ({ data: { name: "Mermaid Boat Trips Curaçao" } }),
}));
vi.mock("@/hooks/use-agent-status", () => ({
  useAgentStatus: () => ({
    data: { available: true, active: true },
    isLoading: false,
  }),
  useSetAgentStatus: () => ({ isPending: false, mutate: vi.fn() }),
}));

describe("Mermaid reservation navigation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "mermaid");
    window.history.replaceState({}, "", "/today");
  });

  it("is strictly tenant gated", () => {
    expect(isMermaidReservationTenant("mermaid")).toBe(true);
    expect(isMermaidReservationTenant("ali-car-rental")).toBe(false);
    expect(isRentalDashboardV2Enabled("mermaid")).toBe(true);
    expect(isRentalDashboardV2Enabled("consulta-despertares")).toBe(false);
  });

  it("keeps daily destinations and moves trip pricing out of the main menu", () => {
    render(
      <RentalDashboardShell active="today" title="Today">
        <div>Dashboard</div>
      </RentalDashboardShell>,
    );
    for (const label of [
      "Today",
      "Reservations",
      "Customers",
      "Conversations",
      "Settings",
    ]) {
      expect(
        screen.getAllByRole("button", { name: label }).length,
      ).toBeGreaterThanOrEqual(1);
    }

    expect(
      screen.queryByRole("button", { name: "Fleet & pricing" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Trip & pricing" })).toBeNull();
    expect(screen.getByText("TRACY · Guest operations")).toBeTruthy();
    expect(screen.getByText("TRACY is active")).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Mermaid guest operations" }),
    ).toBeTruthy();
  });

  it("routes Reservations without leaking the Ali customer path", () => {
    render(
      <RentalDashboardShell active="today" title="Today">
        <div>Dashboard</div>
      </RentalDashboardShell>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Reservations" })[0]);
    expect(window.location.pathname).toBe("/reservations");
  });

  it("shows the exact attention count on desktop and mobile", () => {
    render(
      <RentalDashboardShell active="today" title="Today" actionCount={10}>
        <div>Dashboard</div>
      </RentalDashboardShell>,
    );
    expect(
      screen
        .getAllByLabelText("10 actions need attention")
        .every((badge) => badge.textContent === "10"),
    ).toBe(true);
    expect(screen.queryByText("9+")).toBeNull();
  });

  it("returns a directly opened reservation to the Mermaid list", () => {
    window.history.replaceState({}, "", "/reservations/mer-preview");
    render(
      <RentalDashboardShell active="customers" title="Reservation">
        <div>Guest journey</div>
      </RentalDashboardShell>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Back to previous dashboard page" }),
    );
    expect(window.location.pathname).toBe("/reservations");
  });
});
