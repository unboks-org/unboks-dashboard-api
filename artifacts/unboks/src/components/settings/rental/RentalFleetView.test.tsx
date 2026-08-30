import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RentalCatalogDocument } from "@/lib/rental-catalog";
import { RentalFleetView } from "./RentalFleetView";

const mocks = vi.hoisted(() => ({
  fetchRentalMedia: vi.fn(),
}));

vi.mock("@/lib/rental-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rental-catalog")>();
  return {
    ...actual,
    fetchRentalMedia: mocks.fetchRentalMedia,
  };
});

const mediaAsset = {
  id: "image-1",
  knowledgeSource: "rental_catalog",
  knowledgeId: "yaris",
  filename: "yaris.webp",
  originalFilename: "yaris.webp",
  mimeType: "image/webp",
  sizeBytes: 12_000,
  caption: "Toyota Yaris",
  url: "https://example.com/yaris.webp",
  uploadedAt: "2026-08-30T12:00:00Z",
};

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

function renderFleet(
  onChange = vi.fn(),
  fleetDocument: RentalCatalogDocument = document,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RentalFleetView
        document={fleetDocument}
        errors={[]}
        onChange={onChange}
      />
    </QueryClientProvider>,
  );
  return onChange;
}

describe("RentalFleetView premium vehicle editor", () => {
  beforeEach(() => {
    mocks.fetchRentalMedia.mockResolvedValue(mediaAsset);
  });

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

  it("provides deliberate vehicle controls without changing draft semantics", () => {
    const onChange = renderFleet();

    expect(
      (screen.getByRole("spinbutton", { name: "Seats" }) as HTMLInputElement)
        .value,
    ).toBe("5");
    fireEvent.click(screen.getByRole("button", { name: "Increase seats" }));
    expect(onChange).toHaveBeenCalledWith({
      ...document,
      cars: [{ ...document.cars[0], seats: 6 }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Manual" }));
    expect(onChange).toHaveBeenCalledWith({
      ...document,
      cars: [{ ...document.cars[0], transmission: "manual" }],
    });
  });

  it("opens a large preview when the contained vehicle image is selected", async () => {
    const documentWithImage: RentalCatalogDocument = {
      ...document,
      cars: [{ ...document.cars[0], primaryImageAssetId: "image-1" }],
    };
    renderFleet(vi.fn(), documentWithImage);

    const preview = await screen.findByRole("button", {
      name: "Open larger preview of Toyota Yaris or similar customer-facing photo",
    });
    const thumbnail = screen.getByAltText(
      "Toyota Yaris or similar customer-facing photo",
    );
    const frame = preview.closest("[data-vehicle-media-frame]");
    expect(frame?.className.includes("bg-white")).toBe(true);
    expect(thumbnail.className.includes("h-full")).toBe(true);
    expect(thumbnail.className.includes("w-full")).toBe(true);
    expect(thumbnail.className.includes("object-contain")).toBe(true);
    expect(screen.getByRole("button", { name: "Replace photo" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove vehicle photo" }),
    ).toBeTruthy();
    fireEvent.click(preview);

    expect(
      screen.getByText("Large customer-facing vehicle image preview."),
    ).toBeTruthy();
    expect(
      screen.getAllByAltText(
        "Toyota Yaris or similar customer-facing photo",
      ),
    ).toHaveLength(2);
  });
});
