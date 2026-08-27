import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchDraft: vi.fn(),
  fetchCapability: vi.fn(),
}));

vi.mock("@/lib/rental-catalog", () => ({
  fetchRentalDraft: mocks.fetchDraft,
  fetchRentalCapability: mocks.fetchCapability,
}));

import { useRentalCatalogDraft } from "@/hooks/use-rental-catalog";

describe("useRentalCatalogDraft", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    mocks.fetchDraft.mockReset();
    mocks.fetchCapability.mockReset();
    mocks.fetchDraft.mockResolvedValue({
      tenantSlug: "ali-car-rental",
      revision: 1,
      currentPublishedVersion: 1,
      document: {},
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("loads the draft without repeating the page capability request", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result, unmount } = renderHook(() => useRentalCatalogDraft(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.fetchDraft).toHaveBeenCalledTimes(1);
    expect(mocks.fetchCapability).not.toHaveBeenCalled();

    unmount();
    client.clear();
  });
});
