import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Rental from "@/pages/Rental";

const retry = vi.hoisted(() => vi.fn());
const capability = vi.hoisted(() => ({
  current: {
    enabled: true,
    isLoading: false,
    isUnavailable: false,
    retry,
  },
}));

vi.mock("@/hooks/use-rental-control-capability", () => ({
  useRentalControlCapability: () => capability.current,
}));

vi.mock("@/components/inbox/DashboardShell", () => ({
  DashboardShell: ({
    children,
    pageTitle,
  }: {
    children: React.ReactNode;
    pageTitle: string;
  }) => (
    <main>
      <h1>{pageTitle}</h1>
      {children}
    </main>
  ),
}));

vi.mock("@/components/settings/rental/RentalControlCenter", () => ({
  RentalControlCenter: () => <section>Fleet editor</section>,
}));

vi.mock("@/components/settings/rental/AliDossierSettings", () => ({
  AliDossierSettings: () => <section>Contract and payment settings</section>,
}));

describe("Rental page capability boundary", () => {
  beforeEach(() => {
    retry.mockReset();
    capability.current = {
      enabled: true,
      isLoading: false,
      isUnavailable: false,
      retry,
    };
  });

  it("renders rental controls when the authenticated server capability is enabled", () => {
    sessionStorage.setItem("unboks_active_tenant", "future-rental-tenant");
    render(<Rental />);

    expect(screen.getByRole("heading", { name: "Rental" })).toBeTruthy();
    expect(screen.getByText("Fleet editor")).toBeTruthy();
    expect(screen.getByText("Contract and payment settings")).toBeTruthy();
    expect(screen.queryByText("Rental controls unavailable")).toBeNull();
  });

  it("shows a retryable verification error instead of claiming the tenant is disabled", () => {
    capability.current = {
      ...capability.current,
      enabled: false,
      isUnavailable: true,
    };
    render(<Rental />);

    expect(
      screen.getByRole("heading", {
        name: "Rental controls could not be verified",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("Rental controls unavailable")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows the disabled state only after a successful disabled response", () => {
    capability.current = {
      ...capability.current,
      enabled: false,
    };
    render(<Rental />);

    expect(
      screen.getByRole("heading", { name: "Rental controls unavailable" }),
    ).toBeTruthy();
    expect(screen.queryByText("Fleet editor")).toBeNull();
  });

  it("does not flash the disabled state while capability verification is in flight", () => {
    capability.current = {
      ...capability.current,
      enabled: false,
      isLoading: true,
    };
    render(<Rental />);

    expect(screen.getByText("Loading rental controls…")).toBeTruthy();
    expect(screen.queryByText("Rental controls unavailable")).toBeNull();
  });
});
