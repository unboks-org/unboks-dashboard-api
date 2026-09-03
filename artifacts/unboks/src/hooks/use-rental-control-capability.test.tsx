import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRentalControlCapability } from "@/hooks/use-rental-control-capability";
import { fetchRentalCapability } from "@/lib/rental-catalog";

vi.mock("@/lib/rental-catalog", () => ({
  fetchRentalCapability: vi.fn(),
}));

function NestedRentalObserver() {
  const capability = useRentalControlCapability();
  return (
    <span>{capability.enabled ? "editor ready" : "editor unavailable"}</span>
  );
}

function RentalCapabilityBoundary() {
  const capability = useRentalControlCapability();
  if (capability.isLoading) return <span>loading controls</span>;
  if (!capability.enabled) return <span>controls unavailable</span>;
  return (
    <section>
      <span>controls ready</span>
      <NestedRentalObserver />
    </section>
  );
}

function wrapper(client: QueryClient) {
  return function RentalQueryProvider({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useRentalControlCapability", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    vi.mocked(fetchRentalCapability).mockReset();
  });

  it("does not block Mermaid navigation on an unrelated rental capability", () => {
    sessionStorage.setItem("unboks_active_tenant", "mermaid");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(<RentalCapabilityBoundary />, { wrapper: wrapper(client) });

    expect(screen.getByText("controls unavailable")).toBeTruthy();
    expect(screen.queryByText("loading controls")).toBeNull();
    expect(fetchRentalCapability).not.toHaveBeenCalled();
  });

  it("does not refetch forever when the authorized rental editor mounts", async () => {
    vi.mocked(fetchRentalCapability).mockResolvedValue({
      tenantSlug: "ali-car-rental",
      enabled: true,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(<RentalCapabilityBoundary />, { wrapper: wrapper(client) });

    expect(await screen.findByText("controls ready")).toBeTruthy();
    expect(await screen.findByText("editor ready")).toBeTruthy();
    await waitFor(() => expect(fetchRentalCapability).toHaveBeenCalledTimes(1));
  });

  it("keeps loaded controls mounted during a background verification", async () => {
    let finishRefresh:
      | ((value: { tenantSlug: string; enabled: boolean }) => void)
      | undefined;
    vi.mocked(fetchRentalCapability)
      .mockResolvedValueOnce({ tenantSlug: "ali-car-rental", enabled: true })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRefresh = resolve;
          }),
      );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(<RentalCapabilityBoundary />, { wrapper: wrapper(client) });
    expect(await screen.findByText("editor ready")).toBeTruthy();

    void client.refetchQueries({
      queryKey: ["tenant", "ali-car-rental", "rental-catalog", "capability"],
    });
    await waitFor(() => expect(fetchRentalCapability).toHaveBeenCalledTimes(2));
    expect(screen.getByText("controls ready")).toBeTruthy();
    expect(screen.getByText("editor ready")).toBeTruthy();
    expect(screen.queryByText("loading controls")).toBeNull();

    finishRefresh?.({ tenantSlug: "ali-car-rental", enabled: true });
  });
});
