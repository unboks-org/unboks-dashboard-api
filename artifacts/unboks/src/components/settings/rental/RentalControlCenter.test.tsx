import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/error";
import type { RentalDraftEnvelope } from "@/lib/rental-catalog";

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  save: vi.fn(),
  validate: vi.fn(),
  preview: vi.fn(),
  publish: vi.fn(),
  rollback: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/hooks/use-rental-catalog", () => ({
  useRentalCatalogDraft: () => mocks.query,
}));

vi.mock("@/lib/rental-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rental-catalog")>();
  return {
    ...actual,
    saveRentalDraft: mocks.save,
    validateRentalDraft: mocks.validate,
    previewRentalDraft: mocks.preview,
    publishRentalDraft: mocks.publish,
    rollbackRentalCatalog: mocks.rollback,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { RentalControlCenter } from "./RentalControlCenter";

function envelope(
  tenantSlug: string,
  categoryName: string,
): RentalDraftEnvelope {
  return {
    tenantSlug,
    revision: 4,
    currentPublishedVersion: 3,
    updatedAt: "2026-08-26T12:00:00Z",
    updatedBy: "operator",
    document: {
      settings: {
        currency: "USD",
        quoteValidityHours: 72,
        staffQuoteEmail: "staff@example.com",
        customerDeliveryDelaySeconds: 180,
        availabilityMode: "request_only",
        availabilityCopy: "Subject to staff confirmation.",
        quoteFooter: "",
        pdfLogoAssetId: null,
        refundableSecurityDepositId: "deposit-1",
        refundableSecurityDepositCents: 20_000,
        reservationDepositPercent: 15,
      },
      categories: [
        {
          id: `${tenantSlug}-economy`,
          name: categoryName,
          dailyRateCents: 3500,
          active: true,
          displayOrder: 0,
          archivedAt: null,
        },
      ],
      cars: [],
      supplements: [],
    },
  };
}

function setQuery(data: RentalDraftEnvelope) {
  mocks.query = {
    data,
    isLoading: false,
    isError: false,
    refetch: mocks.refetch,
  };
}

describe("RentalControlCenter", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    setQuery(envelope("ali-car-rental", "Ali Economy"));
    mocks.refetch.mockResolvedValue({ data: mocks.query.data });
    mocks.save.mockReset();
    mocks.validate.mockReset();
    mocks.preview.mockReset();
    mocks.publish.mockReset();
    mocks.rollback.mockReset();
  });

  it("fails closed while switching tenants and never renders the prior draft", async () => {
    const { rerender } = render(<RentalControlCenter />);
    expect(await screen.findByDisplayValue("Ali Economy")).toBeTruthy();

    sessionStorage.setItem("unboks_active_tenant", "second-rental");
    setQuery(envelope("second-rental", "Second Economy"));
    rerender(<RentalControlCenter />);

    expect(screen.queryByDisplayValue("Ali Economy")).toBeNull();
    expect(await screen.findByDisplayValue("Second Economy")).toBeTruthy();
  });

  it("preserves local edits when optimistic concurrency reports a conflict", async () => {
    mocks.save.mockRejectedValue(new ApiError(409, "stale_revision"));
    render(<RentalControlCenter />);

    const category = await screen.findByDisplayValue("Ali Economy");
    fireEvent.change(category, { target: { value: "Locally edited economy" } });
    fireEvent.click(screen.getByRole("button", { name: /preview & publish/i }));
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    expect(
      await screen.findByText(/newer draft exists on the server/i),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /fleet/i }));
    expect(screen.getByDisplayValue("Locally edited economy")).toBeTruthy();
    expect(mocks.refetch).not.toHaveBeenCalled();
  });

  it("allows only one publish mutation while the first click is pending", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.validate.mockResolvedValue({
      tenantSlug: "ali-car-rental",
      valid: true,
      errors: [],
      warnings: [],
    });
    let finishPublish!: (value: unknown) => void;
    mocks.publish.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPublish = resolve;
        }),
    );
    render(<RentalControlCenter />);

    fireEvent.click(
      await screen.findByRole("button", { name: /preview & publish/i }),
    );
    const publish = screen.getByRole("button", { name: /^publish$/i });
    fireEvent.click(publish);
    fireEvent.click(publish);

    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1));
    finishPublish({
      ...envelope("ali-car-rental", "Ali Economy"),
      version: 4,
      contentHash: "hash",
      action: "publish",
      actor: "operator",
      createdAt: "2026-08-26T12:00:00Z",
      sourceVersion: null,
      current: true,
    });
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1));
  });
});
