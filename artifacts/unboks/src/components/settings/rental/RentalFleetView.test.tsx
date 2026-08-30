import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { RentalCatalogDocument } from "@/lib/rental-catalog";
import { RentalFleetView } from "./RentalFleetView";

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
      id: "compact",
      name: "Compact",
      dailyRateCents: 4_500,
      active: true,
      displayOrder: 0,
      archivedAt: null,
    },
  ],
  cars: [
    {
      id: "yaris",
      displayName: "Toyota Yaris or similar",
      categoryId: "compact",
      seats: 5,
      luggageCapacity: 2,
      transmission: "automatic",
      primaryImageAssetId: null,
      active: true,
      displayOrder: 0,
      archivedAt: null,
    },
  ],
  supplements: [],
};

function renderFleet(onChange = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RentalFleetView
        document={document}
        errors={[]}
        onChange={onChange}
      />
    </QueryClientProvider>,
  );
  return onChange;
}

describe("RentalFleetView premium vehicle editor", () => {
  it("presents each vehicle with clear identity, price, photo and visibility", () => {
    renderFleet();

    expect(screen.getByText("Toyota Yaris or similar")).toBeTruthy();
    expect(screen.getByText("Compact · USD 45.00 / day")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Upload photo" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("switch", {
        name: "Show Toyota Yaris or similar to customers",
      }),
    ).toBeTruthy();
  });

  it("keeps customer visibility connected to the catalog draft", () => {
    const onChange = renderFleet();

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Show Toyota Yaris or similar to customers",
      }),
    );

    expect(onChange).toHaveBeenCalledWith({
      ...document,
      cars: [{ ...document.cars[0], active: false }],
    });
  });
});
