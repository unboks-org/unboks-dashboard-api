/**
 * `useAppointments` — combines two data sources for the Appointments page:
 *
 *   1. Backend appointments (GET /appointments). When the endpoint is
 *      live, those rows are authoritative. When it isn't connected
 *      (404 / 501 / 503 / network), `fetchAppointments` resolves to an
 *      empty list, so this hook falls back to the detection layer
 *      below without throwing.
 *
 *   2. Detection from existing conversations. We scan the conversation
 *      list for scheduling signals (cheap, reads only the preview
 *      strings the list endpoint already shipped) and only fetch full
 *      detail for candidates. The detector then decides whether each
 *      candidate has a concrete day + time + (optional) location.
 *
 * The two sources are merged and de-duplicated by the conversation key
 * + dateTimeLabel pair so a backend row and a detected row for the same
 * meeting collapse into one card. Backend rows always win the dedup so
 * their `confirmed` status takes precedence over a `detected` row.
 *
 * The hook returns a `backendAvailable` flag so the page can show a
 * subtle "Pending sync" hint when the only rows on screen come from
 * detection — operators should never be misled into thinking the
 * backend has stored these appointments.
 */

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  fetchAppointments,
  fetchConversation,
  type Appointment,
  type ApiConversation,
  type ConversationDetail,
  type OrderDetails,
  type OrderLine,
} from "@/lib/api";
import { useConversations, useEscalations } from "@/hooks/use-client-api";
import {
  detectAppointment,
  hasSchedulingSignals,
  validateBackendAppointment,
} from "@/lib/appointment-classifier";
import { mapApiConversation, normalizeEscalation } from "@/lib/conversation-mapper";

const APPOINTMENTS_KEY = ["appointments"] as const;

export interface UseAppointmentsResult {
  appointments: Appointment[];
  isLoading: boolean;
  /**
   * True when the backend appointments endpoint returned a real list
   * (even if empty). False when the endpoint returned nothing usable
   * and the rows on screen are detection-only.
   */
  backendAvailable: boolean;
}

export function useAppointments(): UseAppointmentsResult {
  const backend = useQuery({
    queryKey: APPOINTMENTS_KEY,
    queryFn: fetchAppointments,
    staleTime: 60_000,
    // Appointments change less often than inbox traffic — a 30s
    // heartbeat keeps the page fresh without hammering the API.
    // Background polling is off so a hidden tab doesn't tick.
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 0,
  });

  const conversations = useConversations();

  // Live escalations — used as an authoritative "do not show in
  // Appointments" signal. Calvin observed a non-appointment escalation
  // surfacing in the Appointments list (R2-23 problem B). The
  // appointment-classifier lifecycle says any conversation in stages
  // 3-4 (customer_proposed_slots / operator_selected_slot) belongs in
  // Escalations, never Appointments. We treat the escalations endpoint
  // as the source of truth for that: any unresolved escalation's
  // conversation is excluded from the Appointments merge below, even
  // if the backend appointment row claims "confirmed". When the
  // escalation is later resolved (escalationResolved=true), the row
  // drops out of `active` here and the appointment can re-appear.
  const escalations = useEscalations("all");
  const escalatedPhones = useMemo(() => {
    const set = new Set<string>();
    const list = (escalations.data ?? []) as unknown[];
    for (const raw of list) {
      const n = normalizeEscalation(raw);
      if (!n || n.resolved) continue;
      if (n.phone) set.add(n.phone);
    }
    return set;
  }, [escalations.data]);

  const orderEscalationRows = useMemo<Appointment[]>(() => {
    const rows: Appointment[] = [];
    const list = (escalations.data ?? []) as unknown[];
    for (const raw of list) {
      const n = normalizeEscalation(raw);
      if (!n || n.resolved || n.mode !== "order") continue;
      const order = parseOrderDetails(n.body, n.customerName, n.phone);
      const title = orderTitle(n.summary);
      rows.push({
        id: `order-escalation:${n.id}`,
        customerName: order?.customerName || n.customerName,
        channel: (n.platform || "unknown").toLowerCase(),
        conversationId: n.phone ?? `esc:${n.id}`,
        title,
        dateTimeLabel: order?.total != null ? formatOrderTotal(order) : "Order pending",
        location: order?.address || null,
        status: "pending",
        source: "order_escalation",
        createdAt: n.createdAt ?? new Date().toISOString(),
        order,
      });
    }
    return rows;
  }, [escalations.data]);

  // Filter candidates by the cheap preview-string signal so we only
  // fetch full detail for conversations that plausibly contain an
  // appointment.
  const candidates = useMemo(() => {
    const list = conversations.data ?? [];
    return list.filter((c) => hasSchedulingSignals(previewText(c)));
  }, [conversations.data]);

  const detailQueries = useQueries({
    queries: candidates.map((c) => ({
      queryKey: ["conversation", c.phone],
      queryFn: () => fetchConversation(c.phone),
      enabled: Boolean(c.phone),
      staleTime: 30_000,
      retry: 0,
    })),
  });

  const detected = useMemo<Appointment[]>(() => {
    const out: Appointment[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const q = detailQueries[i];
      const detail = q?.data as ConversationDetail | undefined;
      if (!detail) continue;
      const c = candidates[i];
      const mapped = mapApiConversation(c);
      const apt = detectAppointment({
        detail,
        conversationId: c.phone,
        channel: (mapped.channel ?? "Unknown").toLowerCase(),
        customerName: mapped.sender,
      });
      if (apt) out.push(apt);
    }
    return out;
    // detailQueries identities change every render; we rely on the
    // candidates array + each query's data for memoisation. Keeping the
    // dep list explicit so React lints it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, ...detailQueries.map((q) => q.data)]);

  // Look-up table: conversationId → loaded ConversationDetail. Built
  // from the same `useQueries` results the detector already consumes,
  // so the backend-row validator gets the same evidence the detector
  // sees without firing extra fetches.
  const detailByConvId = useMemo(() => {
    const map = new Map<string, ConversationDetail>();
    for (let i = 0; i < candidates.length; i++) {
      const d = detailQueries[i]?.data as ConversationDetail | undefined;
      if (d) map.set(candidates[i].phone, d);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, ...detailQueries.map((q) => q.data)]);

  const merged = useMemo<Appointment[]>(() => {
    const backendList = backend.data?.items ?? [];
    const seen = new Set<string>();
    const key = (a: Appointment) =>
      a.source === "order_escalation" ? a.id : `${a.conversationId}|${a.dateTimeLabel}`;
    const result: Appointment[] = [];
    // Backend rows first so they take precedence on dedup — but each
    // one is run through `validateBackendAppointment` first. A backend
    // "confirmed" that the linked conversation contradicts (multi-slot
    // proposal with no acceptance, OR a different slot was actually
    // confirmed in the same thread) is dropped here so it never lands
    // on the operator's Appointments page.
    for (const a of backendList) {
      const detail = detailByConvId.get(a.conversationId) ?? null;
      const validated = validateBackendAppointment({ apt: a, detail });
      if (!validated) continue;
      const k = key(validated);
      if (seen.has(k)) continue;
      seen.add(k);
      result.push(validated);
    }
    for (const a of orderEscalationRows) {
      const k = key(a);
      if (seen.has(k)) continue;
      seen.add(k);
      result.push(a);
    }
    for (const a of detected) {
      const k = key(a);
      if (seen.has(k)) continue;
      seen.add(k);
      result.push(a);
    }
    // Escalation guard — drop any row whose owning conversation is
    // currently a live (unresolved) escalation. Order escalations are
    // the deliberate exception: Wibrandt-style Orders are represented
    // as unresolved human-confirmation escalations and must remain
    // visible in the renamed Orders workspace.
    const guarded = result.filter(
      (a) => a.source === "order_escalation" || !escalatedPhones.has(a.conversationId),
    );
    // Newest first by createdAt.
    guarded.sort((a, b) => {
      const da = Date.parse(a.createdAt) || 0;
      const db = Date.parse(b.createdAt) || 0;
      return db - da;
    });
    return guarded;
  }, [backend.data, detected, detailByConvId, escalatedPhones, orderEscalationRows]);

  return {
    appointments: merged,
    isLoading:
      conversations.isLoading || detailQueries.some((q) => q.isLoading),
    // True when /appointments returned a real response — even an empty
    // one. Empty-but-connected must NOT be reported as unavailable, or
    // the page would mislabel itself as in fallback mode.
    backendAvailable: backend.isSuccess && backend.data?.connected === true,
  };
}

function previewText(c: ApiConversation): string {
  return [
    c.lastMessage,
    c.latestMessage,
    c.last_message,
    c.preview,
    c.snippet,
    c.body,
    c.text,
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" \n ");
}

function orderTitle(summary: string | null): string {
  const clean = (summary ?? "").trim();
  if (!clean) return "Order awaiting human confirmation";
  return clean.replace(/^\[ORDER\]\s*/i, "").trim() || "Order awaiting human confirmation";
}

function parseOrderDetails(
  body: string | null,
  fallbackName: string,
  fallbackPhone: string | null,
): OrderDetails | null {
  if (!body) return null;
  const payload = extractOrderPayload(body);
  if (payload) return normalizeOrderPayload(payload, fallbackName, fallbackPhone);
  return parseLegacyOrderBody(body, fallbackName, fallbackPhone);
}

function extractOrderPayload(body: string): Record<string, unknown> | null {
  const marker = "=== ORDER PAYLOAD ===";
  const start = body.indexOf(marker);
  if (start < 0) return null;
  const after = body.slice(start + marker.length).trim();
  const nextMarker = after.search(/\n\s*=== /);
  const jsonText = (nextMarker >= 0 ? after.slice(0, nextMarker) : after).trim();
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeOrderPayload(
  raw: Record<string, unknown>,
  fallbackName: string,
  fallbackPhone: string | null,
): OrderDetails {
  const productsRaw = Array.isArray(raw.products) ? raw.products : [];
  const products = productsRaw
    .map((p): OrderLine | null => {
      if (!p || typeof p !== "object") return null;
      const item = p as Record<string, unknown>;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!name) return null;
      return {
        name,
        quantity: numberOrNull(item.quantity),
        unitPrice: numberOrNull(item.unit_price ?? item.unitPrice),
        subtotal: numberOrNull(item.subtotal),
      };
    })
    .filter((p): p is OrderLine => p !== null);

  return {
    customerName: stringOr(raw.customer_name ?? raw.customerName, fallbackName),
    phone: stringOr(raw.phone, fallbackPhone ?? ""),
    address: stringOr(raw.delivery_address ?? raw.deliveryAddress ?? raw.address, ""),
    products,
    total: numberOrNull(raw.total),
    currency: stringOr(raw.currency, ""),
    comments: stringOr(raw.comments, ""),
  };
}

function parseLegacyOrderBody(
  body: string,
  fallbackName: string,
  fallbackPhone: string | null,
): OrderDetails | null {
  const customerName = matchLine(body, /^Customer:\s*(.+)$/im) || fallbackName;
  const phone = matchLine(body, /^Phone:\s*(.+)$/im) || fallbackPhone || "";
  const address = matchLine(body, /^Delivery address:\s*(.+)$/im) || "";
  const totalLine = matchLine(body, /^Total:\s*(.+)$/im) || "";
  const totalMatch = totalLine.match(/^([A-Z]{2,4})?\s*([0-9]+(?:\.[0-9]+)?)$/i);
  const currency = totalMatch?.[1]?.toUpperCase() ?? "";
  const total = totalMatch ? Number(totalMatch[2]) : null;
  const products = parseLegacyProducts(body);
  if (!customerName && !phone && !address && products.length === 0 && total == null) return null;
  return { customerName, phone, address, products, total, currency, comments: "" };
}

function parseLegacyProducts(body: string): OrderLine[] {
  const marker = "=== PRODUCTS ===";
  const start = body.indexOf(marker);
  if (start < 0) return [];
  const after = body.slice(start + marker.length);
  const end = after.search(/\n\s*=== /);
  const block = end >= 0 ? after.slice(0, end) : after;
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-"))
    .map((line) => {
      const clean = line.replace(/^-\s*/, "");
      const main = clean.split("|")[0]?.trim() ?? "";
      const m = main.match(/^(\d+(?:\.\d+)?)\s*x\s*(.+)$/i);
      if (m) return { quantity: Number(m[1]), name: m[2].trim() };
      return { quantity: null, name: main };
    })
    .filter((p) => p.name);
}

function formatOrderTotal(order: OrderDetails): string {
  if (order.total == null) return "Order pending";
  return `${order.currency ? `${order.currency} ` : ""}${formatNumber(order.total)}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function matchLine(body: string, re: RegExp): string | null {
  const m = body.match(re);
  return m?.[1]?.trim() || null;
}
