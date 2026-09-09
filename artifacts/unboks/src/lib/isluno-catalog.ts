import { apiFetch } from "./api";
import { ApiError } from "./error";
import { captureTenantRequestScope, getApiBase, getClientSlug } from "./tenant";

export interface Asset {
  id: string;
  order: number;
  caption: string;
  source_url: string;
  validation_status: string;
  sha256?: string;
  [key: string]: unknown;
}
export interface Rules {
  guest_rules: {
    minimum_age: number;
    maximum_age: number;
    adult_min_age: number;
    max_guests?: number;
    children_require_adult?: boolean;
  } | null;
  price_rules: {
    currency: string;
    currency_exponent: number;
    basis: string;
    taxes_fees: string;
    payment_terms: string;
    evidence: string;
    amount_minor?: number;
    max_guests?: number;
    age_bands?: {
      id: string;
      minimum_age: number;
      maximum_age: number;
      amount_minor: number;
    }[];
  } | null;
  schedule: {
    timezone: string;
    weekdays: number[];
    slots: { id: string; start: string; duration_minutes: number }[];
    evidence: string;
    check_in_minutes_before?: number;
    published_check_in_times?: string[];
  } | null;
  options:
    | {
        id: string;
        name: string;
        amount_minor: number;
        max_quantity: number;
        basis: string;
        required: boolean;
      }[]
    | null;
  pickup: { mode: string; meeting_point: string; option_id?: string } | null;
  policies: {
    verified: boolean;
    cancellation: string;
    safety: string;
    evidence: string;
  } | null;
}
export interface Product extends Rules {
  id: string;
  name: string;
  category: string;
  summary: string;
  enabled: boolean;
  inclusions: string[];
  gallery: Asset[];
  source: { url: string; observed_at: string };
  source_claims?: Record<string, unknown>;
  readiness: {
    quotable: boolean;
    source_unresolved: string[];
    unresolved: string[];
    pricing_mode: string;
  };
  demo_rules?: {
    authority: string;
    version: string;
    label: string;
    approval_ref: string;
    real_booking_eligible: false;
    rules: Rules;
  } | null;
}
export interface CatalogResponse {
  catalog: { products: Product[]; version: string; tenant_slug: string };
  revision: string;
  editable: boolean;
}
export interface IslunoCapabilities {
  enabled: boolean;
  known: boolean;
  tenant_slug: string | null;
  brand?: {
    id: string;
    name: string;
    assistant_name: string;
    website: string;
    primary_color: string;
  } | null;
  capabilities: {
    brand_profile?: boolean;
    catalog_editor: boolean;
    itinerary_workspace?: boolean;
  };
}
export const fetchIslunoCapabilities = () =>
  apiFetch<IslunoCapabilities>(
    "/isluno/capabilities",
    { cache: "no-store" },
    false,
    true,
  );
export const fetchIslunoCatalog = () =>
  apiFetch<CatalogResponse>(
    "/isluno/catalog",
    { cache: "no-store" },
    false,
    true,
  );
export function productChanges(product: Product) {
  const {
    name,
    category,
    summary,
    enabled,
    inclusions,
    gallery,
    guest_rules,
    price_rules,
    schedule,
    options,
    pickup,
    policies,
    demo_rules,
  } = product;
  return {
    name,
    category,
    summary,
    enabled,
    inclusions,
    gallery,
    guest_rules,
    price_rules,
    schedule,
    options,
    pickup,
    policies,
    ...(demo_rules ? { demo_rules } : {}),
  };
}
export const publishIslunoCatalog = (revision: string, product: Product) =>
  apiFetch<CatalogResponse>(
    "/isluno/catalog",
    {
      method: "PUT",
      body: JSON.stringify({
        expected_revision: revision,
        changes: [{ id: product.id, changes: productChanges(product) }],
      }),
    },
    false,
    true,
  );
export async function fetchIslunoImage(digest: string): Promise<Blob> {
  const { tenantSlug, token } = captureTenantRequestScope();
  if (tenantSlug !== "mermaid" || !/^[a-f0-9]{64}$/.test(digest))
    throw new ApiError(403, "Image unavailable");
  const response = await fetch(
    `${getApiBase(tenantSlug)}/isluno/catalog/media/${digest}.jpg`,
    { cache: "no-store", headers: { Authorization: `Bearer ${token}` } },
  );
  if (
    !response.ok ||
    response.headers.get("X-Unboks-Tenant") !== tenantSlug ||
    getClientSlug() !== tenantSlug
  )
    throw new ApiError(response.status, "Image unavailable");
  const blob = await response.blob();
  if (blob.type !== "image/jpeg" || getClientSlug() !== tenantSlug)
    throw new ApiError(422, "Image unavailable");
  return blob;
}
