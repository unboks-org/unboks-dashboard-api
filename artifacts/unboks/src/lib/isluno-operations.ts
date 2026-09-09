import { apiFetch } from "./api";
import { ApiError } from "./error";
import { captureTenantRequestScope, getApiBase, getClientSlug } from "./tenant";
export interface Journey {
  id: string;
  guest_id: string;
  itinerary_id: string;
  brand: string;
  guest_name: string;
  customer_ref: string;
  conversation_id: string;
  stage: string;
  stage_label: string;
  item_count: number;
  totals: {
    currency: string | null;
    currency_exponent: number | null;
    total_minor: number;
  };
  revision: number;
  created_at: string;
  updated_at: string;
  valid_actions: {
    open_inbox: boolean;
    advance_booking: false;
    real_booking: false;
  };
  inbox_path: string;
  guest: { name?: string; ages?: number[] };
  item_details: Record<
    string,
    { guest_name?: string; pickup_location?: string }
  >;
}
export interface JourneyItem {
  id: string;
  status: string;
  product: { name: string };
  selection: {
    date: string;
    guest_ages: number[];
    pickup: boolean;
    slot_id: string;
  };
  starts_at: string;
  ends_at: string;
  timezone: string;
  currency: string;
  currency_exponent: number;
  total_minor: number;
  lines: {
    kind: string;
    key: string;
    quantity: number;
    unit_minor: number;
    amount_minor: number;
  }[];
  pricing_snapshot: { label: string; pricing_mode: string };
}
interface Snapshot {
  id: string;
  itinerary: { id: string; items: JourneyItem[]; totals: Journey["totals"] };
  guest: { name?: string };
  created_at: string;
  document_language: string;
}
export interface JourneyDetail extends Journey {
  item_stages: Record<string, { stage: string; label: string }>;
  itinerary: { items: JourneyItem[]; status: string };
  versions: {
    revision: number;
    status: string;
    updated_at: string;
    items: JourneyItem[];
    totals: Journey["totals"];
  }[];
  quotes: {
    id: string;
    version: number;
    status: string;
    snapshot: Snapshot;
    summary_confirmed_at: string | null;
    approved_at: string | null;
    expires_at: string;
    sha256: string;
  }[];
  payment: null | {
    id: string;
    quote_id: string;
    paid_at: string;
    mode: string;
    emails: {
      id: string;
      recipient: string;
      status: string;
      error: string | null;
      message_id: string;
    }[];
  };
  documents: {
    id: string;
    kind: string;
    item_id: string | null;
    ticket_id?: string;
    quote_version?: number;
    sha256: string;
  }[];
  deliveries: {
    quote_id: string;
    quote_version: number;
    quote_status: string;
    document_kind: string | null;
    item_id: string | null;
    ticket_id: string | null;
    part_count: number;
    job_id: string;
    part: number;
    stage: string;
    status: string;
    provider_id: string | null;
    document_id: string | null;
    label: string;
    delivered_at: null;
  }[];
  events: {
    kind: string;
    at: string | null;
    reference?: string;
    revision?: number;
    version?: number;
    status?: string;
  }[];
  operator_requests: { id: string; reason: string; status: string }[];
  related_itineraries: Journey[];
  delivery_notice: string;
}
export interface JourneyPage {
  items: Journey[];
  total: number;
  next_offset: number | null;
}
async function scopedRead<T>(path: string): Promise<T> {
  const tenant = getClientSlug();
  if (tenant !== "mermaid")
    throw new ApiError(403, "Isluno workspace unavailable");
  const data = await apiFetch<T>(path, { cache: "no-store" }, false, true);
  if (getClientSlug() !== tenant)
    throw new ApiError(409, "Workspace response rejected");
  return data;
}
export function fetchJourneys(q = "", offset = 0, guestId?: string) {
  const params = new URLSearchParams({ q, offset: String(offset) });
  if (guestId) params.set("guest_id", guestId);
  return scopedRead<JourneyPage>("/isluno/operations/journeys?" + params);
}
export const fetchJourney = (id: string) =>
  scopedRead<JourneyDetail>(
    "/isluno/operations/journeys/" + encodeURIComponent(id),
  );
export async function fetchJourneyPdf(id: string, documentId: string) {
  const { tenantSlug, token } = captureTenantRequestScope();
  if (tenantSlug !== "mermaid") throw new ApiError(403, "Document unavailable");
  const response = await fetch(
    `${getApiBase(tenantSlug)}/isluno/operations/journeys/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}.pdf`,
    { cache: "no-store", headers: { Authorization: `Bearer ${token}` } },
  );
  if (
    !response.ok ||
    getClientSlug() !== tenantSlug ||
    response.headers.get("X-Unboks-Tenant") !== tenantSlug
  )
    throw new ApiError(response.status, "Document could not be loaded");
  const blob = await response.blob();
  if (blob.type !== "application/pdf" || getClientSlug() !== tenantSlug)
    throw new ApiError(422, "Document unavailable");
  return blob;
}
export function money(total: Journey["totals"]): string {
  if (!total.currency || total.currency_exponent == null)
    return "No priced items";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currencyDisplay: "code",
    currency: total.currency,
  }).format(total.total_minor / 10 ** total.currency_exponent);
}
export interface Guest {
  id: string;
  customer_ref: string;
  names: string[];
  itinerary_count: number;
  item_count: number;
  updated_at: string;
  inbox_path: string;
}
export const fetchIslunoGuests = (q = "", offset = 0) =>
  scopedRead<{ items: Guest[]; total: number; next_offset: number | null }>(
    "/isluno/operations/guests?" +
      new URLSearchParams({ q, offset: String(offset) }),
  );

export interface IslunoToday {
  recovery?: {
    reminders_enabled: boolean;
    incidents: {
      id: string;
      inbox_path?: string;
      scope_key: string;
      itinerary_id: string | null;
      delivery_progress_verified?: boolean;
      kind: string;
      status: string;
      code: string;
      created_at: string;
    }[];
    reminders: {
      id: string;
      inbox_path?: string;
      itinerary_id: string;
      due_at: string;
      status: string;
      provider_id: string | null;
      reason: string | null;
    }[];
    outbound_failures: {
      reason?: string;
      http_status?: number | null;
      parts?: { index: number; status: string; reason?: string | null; http_status?: number | null }[];
      id: string;
      inbox_path?: string;
      status: string;
      provider_id: string | null;
    }[];
    legacy: {
      activated_at: string | null;
      quarantined: {
        source: string;
        reference: string;
        conversation_id: string | null;
        original_status: string;
        disposition: string;
        sha256: string;
      }[];
    };
  };
  as_of: string;
  journeys: Pick<
    Journey,
    | "id"
    | "guest_name"
    | "stage"
    | "stage_label"
    | "item_count"
    | "totals"
    | "updated_at"
    | "inbox_path"
  >[];
  attention: {
    id: string;
    journey_id: string;
    guest_name: string;
    kind: string;
    status: string;
    label: string;
    inbox_path: string;
  }[];
  scheduled_today: {
    journey_id: string;
    item_id: string;
    guest_name: string;
    product_name: string;
    starts_at: string;
    timezone: string;
    stage_label: string;
  }[];
  counts: {
    itineraries: number;
    trip_items: number;
    demo_paid: number;
    attention: number;
  };
  availability: "assumed_demo";
  payment: "simulated";
}
export const fetchIslunoToday = () =>
  scopedRead<IslunoToday>("/isluno/operations/today");
