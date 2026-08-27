import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/error";
import {
  fetchRentalDraft,
  formatCents,
  parseCents,
  rentalFieldErrors,
  saveRentalDraft,
  type RentalCatalogDocument,
} from "@/lib/rental-catalog";

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
  categories: [],
  cars: [],
  supplements: [],
};

describe("rental catalog client", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    localStorage.setItem("wtyj_token_ali-car-rental", "ali-token");
  });

  it("parses money into integer cents without float arithmetic", () => {
    expect(parseCents("35")).toBe(3500);
    expect(parseCents("35.5")).toBe(3550);
    expect(parseCents("35,50")).toBe(3550);
    expect(parseCents("35.555")).toBeNull();
    expect(parseCents("-1")).toBeNull();
    expect(formatCents(3505)).toBe("35.05");
  });

  it("requires tenant identity on rental responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            revision: 1,
            currentPublishedVersion: null,
            document,
            updatedAt: null,
            updatedBy: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(fetchRentalDraft()).rejects.toThrow(
      "Workspace response rejected",
    );
  });

  it("rejects a cross-tenant rental response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            tenantSlug: "consulta-despertares",
            revision: 1,
            currentPublishedVersion: null,
            document,
            updatedAt: null,
            updatedBy: null,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Unboks-Tenant": "consulta-despertares",
            },
          },
        ),
      ),
    );

    await expect(fetchRentalDraft()).rejects.toThrow(
      "Workspace response rejected",
    );
  });

  it("sends the exact optimistic revision and whole document", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            tenantSlug: "ali-car-rental",
            revision: 5,
            currentPublishedVersion: 3,
            document,
            updatedAt: "2026-08-26T12:00:00Z",
            updatedBy: "operator",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Unboks-Tenant": "ali-car-rental",
            },
          },
        ),
      ),
    );

    await saveRentalDraft(4, document);

    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain(
      "/api/ali-car-rental/dashboard/api/rental-catalog/draft",
    );
    expect(request).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ expectedRevision: 4, document }),
    });
  });

  it("keeps structured field errors available to the editor", () => {
    const error = new ApiError(422, "validation_failed", {
      detail: {
        code: "validation_failed",
        errors: [
          {
            path: "categories.0.dailyRateCents",
            code: "positive",
            message: "Set a positive daily rate.",
          },
        ],
      },
    });

    expect(rentalFieldErrors(error)).toEqual([
      {
        path: "categories.0.dailyRateCents",
        code: "positive",
        message: "Set a positive daily rate.",
      },
    ]);
  });
});
