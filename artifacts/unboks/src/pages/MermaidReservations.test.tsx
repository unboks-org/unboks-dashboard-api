import { render, screen } from "@testing-library/react";
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
});
