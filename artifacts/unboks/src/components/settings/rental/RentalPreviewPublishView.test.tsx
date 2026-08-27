import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  RentalCatalogDocument,
  RentalPreviewScenario,
} from "@/lib/rental-catalog";
import { RentalPreviewPublishView } from "./RentalPreviewPublishView";

const document: RentalCatalogDocument = {
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
      id: "economy",
      name: "Economy",
      dailyRateCents: 3500,
      active: true,
      displayOrder: 0,
      archivedAt: null,
    },
  ],
  cars: [
    {
      id: "yaris",
      displayName: "Toyota Yaris or similar",
      categoryId: "economy",
      seats: 5,
      transmission: "automatic",
      primaryImageAssetId: "asset-1",
      active: true,
      displayOrder: 0,
      archivedAt: null,
    },
  ],
  supplements: [],
};

const scenario: RentalPreviewScenario = {
  rentalStart: "2026-09-01",
  rentalEnd: "2026-09-04",
  carId: "yaris",
  categoryId: null,
  supplements: [],
  locale: "en",
};

function renderView(
  overrides: Partial<
    React.ComponentProps<typeof RentalPreviewPublishView>
  > = {},
) {
  const props: React.ComponentProps<typeof RentalPreviewPublishView> = {
    document,
    revision: 4,
    currentVersion: 3,
    dirty: false,
    scenario,
    onScenario: vi.fn(),
    preview: null,
    pdfUrl: null,
    errors: [],
    warnings: [],
    pendingAction: null,
    onSave: vi.fn(),
    onValidate: vi.fn(),
    onPreview: vi.fn(),
    onPublish: vi.fn(),
    onRollback: vi.fn(),
    ...overrides,
  };
  render(<RentalPreviewPublishView {...props} />);
  return props;
}

describe("RentalPreviewPublishView", () => {
  it("states the no-send boundary and offers all customer locales", () => {
    renderView();

    expect(
      screen.getByText(/no customer message, staff email, or operator alert/i),
    ).toBeTruthy();
    const locale = screen.getByLabelText(
      "Customer language",
    ) as HTMLSelectElement;
    expect([...locale.options].map((option) => option.value)).toEqual([
      "en",
      "nl",
      "pap",
      "de",
    ]);
  });

  it("keeps save disabled for a clean draft and invokes preview once", () => {
    const props = renderView();

    expect(
      (screen.getByRole("button", { name: /save draft/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /preview quote/i }));
    expect(props.onPreview).toHaveBeenCalledTimes(1);
  });

  it("renders exact totals and the returned customer text", () => {
    renderView({
      preview: {
        tenantSlug: "ali-car-rental",
        deliveryAttempted: false,
        quote: {
          currency: "USD",
          rentalDays: 3,
          rentalTotalCents: 10_500,
          refundableSecurityDepositCents: 20_000,
          grandTotalCents: 30_500,
          items: [],
        },
        customerWhatsAppText: "Your official quote is ready.",
        pdfPreviewId: "preview-1",
        pdfSha256: "abc",
        pdfBytes: 31_204,
      },
      pdfUrl: "blob:test",
    });

    expect(screen.getByText("Your official quote is ready.")).toBeTruthy();
    expect(screen.getByText("USD 105.00")).toBeTruthy();
    expect(screen.getByText("USD 200.00")).toBeTruthy();
    expect(screen.getByText("USD 305.00")).toBeTruthy();
    expect(screen.getByTitle("Rental quote PDF preview")).toBeTruthy();
  });
});
