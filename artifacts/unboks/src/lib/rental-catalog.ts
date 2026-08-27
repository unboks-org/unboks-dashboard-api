import { apiFetch, type KnowledgeMedia } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { captureTenantRequestScope, getApiBase } from "@/lib/tenant";

export type RentalTransmission = "automatic" | "manual";
export type RentalBillingBasis = "per_day" | "per_rental";

export interface RentalSettings {
  currency: string;
  quoteValidityHours: number;
  staffQuoteEmail: string;
  customerDeliveryDelaySeconds: number;
  availabilityMode: "request_only";
  availabilityCopy: string;
  quoteFooter: string;
  pdfLogoAssetId: string | null;
  refundableSecurityDepositId: string;
  refundableSecurityDepositCents: number;
  reservationDepositPercent: number;
}

export interface VehicleCategory {
  id: string;
  name: string;
  dailyRateCents: number;
  active: boolean;
  displayOrder: number;
  archivedAt: string | null;
}

export interface RentalCar {
  id: string;
  displayName: string;
  categoryId: string;
  seats: number;
  transmission: RentalTransmission;
  primaryImageAssetId: string | null;
  active: boolean;
  displayOrder: number;
  archivedAt: string | null;
}

export interface RentalSupplement {
  id: string;
  name: string;
  priceCents: number;
  billingBasis: RentalBillingBasis;
  quantitySelectable: boolean;
  maxQuantity: number;
  active: boolean;
  displayOrder: number;
  archivedAt: string | null;
}

export interface RentalCatalogDocument {
  settings: RentalSettings;
  categories: VehicleCategory[];
  cars: RentalCar[];
  supplements: RentalSupplement[];
}

export interface RentalDraftEnvelope {
  tenantSlug: string;
  revision: number;
  currentPublishedVersion: number | null;
  document: RentalCatalogDocument;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface RentalCapabilityEnvelope {
  tenantSlug: string;
  enabled: boolean;
}

export interface RentalFieldError {
  path: string;
  code: string;
  message: string;
}

export interface RentalValidationResult {
  tenantSlug: string;
  valid: boolean;
  errors: RentalFieldError[];
  warnings: RentalFieldError[];
}

export interface RentalPreviewScenario {
  rentalStart: string;
  rentalEnd: string;
  carId: string | null;
  categoryId: string | null;
  supplements: Array<{ id: string; quantity: number }>;
  locale: "en" | "nl" | "pap" | "de";
}

export interface RentalPreviewResult {
  tenantSlug: string;
  deliveryAttempted: false;
  quote: {
    currency: string;
    rentalDays: number;
    rentalTotalCents: number;
    refundableSecurityDepositCents: number;
    grandTotalCents: number;
    items: Array<{
      kind: "rental" | "supplement";
      id: string;
      name: string;
      quantity: number;
      unitPriceCents: number;
      subtotalCents: number;
      billingBasis?: RentalBillingBasis;
    }>;
  };
  customerWhatsAppText: string;
  pdfPreviewId: string;
  pdfSha256: string;
  pdfBytes: number;
}

export interface RentalPublishedVersion {
  tenantSlug: string;
  version: number;
  contentHash: string;
  action: "publish" | "rollback";
  actor: string;
  createdAt: string;
  sourceVersion: number | null;
  current: boolean;
  draftRevision?: number;
  document: RentalCatalogDocument;
}

export function cloneRentalDocument(
  document: RentalCatalogDocument,
): RentalCatalogDocument {
  return structuredClone(document);
}

export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) return "0.00";
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function parseCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function rentalFieldErrors(error: unknown): RentalFieldError[] {
  if (
    !(error instanceof ApiError) ||
    !error.details ||
    typeof error.details !== "object"
  ) {
    return [];
  }
  const detail = (error.details as Record<string, unknown>).detail;
  if (!detail || typeof detail !== "object") return [];
  const errors = (detail as Record<string, unknown>).errors;
  return Array.isArray(errors)
    ? errors.filter((item): item is RentalFieldError => {
        if (!item || typeof item !== "object") return false;
        const record = item as Record<string, unknown>;
        return (
          typeof record.path === "string" &&
          typeof record.code === "string" &&
          typeof record.message === "string"
        );
      })
    : [];
}

export function fetchRentalDraft(
  signal?: AbortSignal,
): Promise<RentalDraftEnvelope> {
  return apiFetch<RentalDraftEnvelope>(
    "/rental-catalog/draft",
    { signal, cache: "no-store" },
    false,
    true,
  );
}

export function fetchRentalCapability(
  signal?: AbortSignal,
): Promise<RentalCapabilityEnvelope> {
  return apiFetch<RentalCapabilityEnvelope>(
    "/rental-catalog/capability",
    { signal, cache: "no-store" },
    false,
    true,
  );
}

export function saveRentalDraft(
  expectedRevision: number,
  document: RentalCatalogDocument,
): Promise<RentalDraftEnvelope> {
  return apiFetch<RentalDraftEnvelope>(
    "/rental-catalog/draft",
    {
      method: "PUT",
      body: JSON.stringify({ expectedRevision, document }),
    },
    false,
    true,
  );
}

export function validateRentalDraft(
  document: RentalCatalogDocument,
): Promise<RentalValidationResult> {
  return apiFetch<RentalValidationResult>(
    "/rental-catalog/validate",
    {
      method: "POST",
      body: JSON.stringify({ document }),
    },
    false,
    true,
  );
}

export function previewRentalDraft(
  document: RentalCatalogDocument,
  scenario: RentalPreviewScenario,
): Promise<RentalPreviewResult> {
  return apiFetch<RentalPreviewResult>(
    "/rental-catalog/preview",
    {
      method: "POST",
      body: JSON.stringify({ document, scenario }),
    },
    false,
    true,
  );
}

export function publishRentalDraft(
  expectedRevision: number,
  idempotencyKey: string,
): Promise<RentalPublishedVersion> {
  return apiFetch<RentalPublishedVersion>(
    "/rental-catalog/publish",
    {
      method: "POST",
      body: JSON.stringify({ expectedRevision, idempotencyKey }),
    },
    false,
    true,
  );
}

export function rollbackRentalCatalog(
  expectedCurrentVersion: number,
  idempotencyKey: string,
): Promise<RentalPublishedVersion> {
  return apiFetch<RentalPublishedVersion>(
    "/rental-catalog/rollback",
    {
      method: "POST",
      body: JSON.stringify({ expectedCurrentVersion, idempotencyKey }),
    },
    false,
    true,
  );
}

export async function fetchRentalPreviewPdf(previewId: string): Promise<Blob> {
  const { tenantSlug, token } = captureTenantRequestScope();
  const response = await fetch(
    `${getApiBase(tenantSlug)}/rental-catalog/previews/${encodeURIComponent(previewId)}/pdf`,
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache",
      },
    },
  );
  const responseTenant = response.headers.get("X-Unboks-Tenant");
  if (!response.ok || responseTenant !== tenantSlug) {
    throw new ApiError(
      response.ok ? 409 : response.status,
      response.ok
        ? "Workspace response rejected"
        : "Could not load PDF preview.",
    );
  }
  const blob = await response.blob();
  if (blob.type !== "application/pdf") {
    throw new ApiError(422, "Preview response was not a PDF.");
  }
  return blob;
}

export async function uploadRentalMedia(
  ownerId: string,
  file: File,
  caption = "Rental catalog image",
): Promise<KnowledgeMedia> {
  const body = new FormData();
  body.append("owner_id", ownerId);
  body.append("caption", caption);
  body.append("file", file);
  const response = await apiFetch<{
    tenantSlug: string;
    asset: KnowledgeMedia;
  }>("/rental-catalog/media", { method: "POST", body }, false, true);
  return response.asset;
}

export async function fetchRentalMedia(
  assetId: string,
): Promise<KnowledgeMedia> {
  const response = await apiFetch<{
    tenantSlug: string;
    asset: KnowledgeMedia;
  }>(
    `/rental-catalog/media/${encodeURIComponent(assetId)}`,
    { cache: "no-store" },
    false,
    true,
  );
  return response.asset;
}

export function deleteRentalMedia(
  assetId: string,
): Promise<{ tenantSlug: string; deleted: true }> {
  return apiFetch(
    `/rental-catalog/media/${encodeURIComponent(assetId)}`,
    {
      method: "DELETE",
    },
    false,
    true,
  );
}
