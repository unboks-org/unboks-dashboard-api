import type { Conversation } from "@/data/conversations";
import type { ApiMessage, MermaidReservationSummary } from "@/lib/api";
import { normalizeEscalation } from "@/lib/conversation-mapper";
import { mermaidTodayKey } from "@/lib/mermaid-operations";

export interface MermaidAttentionIssue {
  id: string;
  mode: "soft" | "hard" | null;
  reason: string;
  context: string;
  decision: string;
  createdAt: string | null;
  customerRequest?: string;
  customerMessage?: string;
}

export interface MermaidAttentionCase {
  key: string;
  conversationId: string | null;
  customerName: string;
  channel: string;
  issues: MermaidAttentionIssue[];
  reservation?: MermaidReservationSummary;
  fallbackReason: string;
  createdAt: string | null;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
const timestamp = (value: string | null) => Date.parse(value ?? "") || 0;

/** Preserve the endpoint's actual mode. A paused soft escalation is NOT a
 * hard escalation: /guidance and /reply have different delivery semantics. */
export function mermaidIssue(raw: unknown): MermaidAttentionIssue | null {
  const n = normalizeEscalation(raw);
  if (!n || n.resolved || n.mode === "order") return null;
  const row = record(raw);
  const summary = record(row.escalationSummary ?? row.escalation_summary);
  const mode = row.mode ?? row.escalation_mode ?? row.escalationMode;
  return {
    id: n.id,
    mode: mode === "soft" || mode === "hard" ? mode : null,
    reason:
      text(summary.reason) ||
      text(summary.summary) ||
      text(summary.customerWants) ||
      n.summary ||
      "The reason was not recorded.",
    context: text(summary.customerWants) || n.body || "",
    decision: text(summary.operatorNeedsToDecide),
    customerRequest: text(summary.customerWants),
    customerMessage: text(summary.latestCustomerMessage),
    createdAt: n.createdAt,
  };
}

/** One count per conversation, with EVERY unresolved issue retained. Unread
 * alone never means an HO decision. Canonical resolved rows beat stale flags. */
export function buildMermaidAttention(
  reservations: MermaidReservationSummary[],
  conversations: Conversation[],
  rawEscalations: unknown[],
  visible: (keys: string[]) => boolean = () => true,
): MermaidAttentionCase[] {
  if (
    !Array.isArray(reservations) ||
    !Array.isArray(conversations) ||
    !Array.isArray(rawEscalations)
  )
    return [];
  const byAlias = new Map<string, Conversation>();
  for (const c of conversations) {
    byAlias.set(c.id, c);
    if (c.conversationKey) byAlias.set(c.conversationKey, c);
  }
  const cases = new Map<string, MermaidAttentionCase>();
  const known = new Set<string>();
  for (const raw of rawEscalations) {
    const n = normalizeEscalation(raw);
    if (!n) continue;
    const phone = n.phone || text(record(raw).customer_id) || null;
    const c = phone ? byAlias.get(phone) : undefined;
    const conversationId = c?.conversationKey || c?.id || phone;
    const channel = c?.channel || n.platform.toLowerCase() || "whatsapp";
    const key = conversationId
      ? `${channel}:${conversationId}`
      : `escalation:${n.id}`;
    if (
      !visible([conversationId ?? "", c?.id ?? "", phone ?? "", `esc:${n.id}`])
    )
      continue;
    known.add(key);
    const issue = mermaidIssue(raw);
    if (!issue) continue;
    let item = cases.get(key);
    if (!item) {
      item = {
        key,
        conversationId,
        channel,
        customerName: c?.sender || n.customerName,
        issues: [],
        fallbackReason: "",
        createdAt: n.createdAt,
      };
      cases.set(key, item);
    }
    if (!item.issues.some((existing) => existing.id === issue.id))
      item.issues.push(issue);
    if (timestamp(n.createdAt) < timestamp(item.createdAt))
      item.createdAt = n.createdAt;
  }
  for (const r of reservations) {
    const c = byAlias.get(r.conversationId);
    const id = c?.conversationKey || c?.id || r.conversationId;
    const key = `${c?.channel || "whatsapp"}:${id}`;
    if (!visible([id, r.conversationId, c?.id ?? ""])) continue;
    const existing = cases.get(key);
    if (existing) {
      if (!existing.reservation || r.updatedAt > existing.reservation.updatedAt)
        existing.reservation = r;
    } else if (r.humanTakeover && !known.has(key)) {
      cases.set(key, {
        key,
        conversationId: id,
        customerName: r.customerName,
        channel: c?.channel || "whatsapp",
        issues: [],
        reservation: r,
        fallbackReason:
          c?.escalationSummary ||
          "Reservation handover: no linked escalation reason was recorded.",
        createdAt: r.updatedAt,
      });
    }
  }
  for (const c of conversations) {
    const id = c.conversationKey || c.id;
    const key = `${c.channel}:${id}`;
    if (
      !c.escalated ||
      known.has(key) ||
      cases.has(key) ||
      !visible([id, c.id])
    )
      continue;
    cases.set(key, {
      key,
      conversationId: id,
      customerName: c.sender,
      channel: c.channel,
      issues: [],
      fallbackReason:
        c.escalationSummary ||
        "Conversation flagged for review; no linked escalation was returned.",
      createdAt: c.timestampMs ? new Date(c.timestampMs).toISOString() : null,
    });
  }
  const today = mermaidTodayKey();
  return [...cases.values()].sort(
    (a, b) =>
      Number(b.reservation?.tripDate === today) -
        Number(a.reservation?.tripDate === today) ||
      timestamp(a.createdAt) - timestamp(b.createdAt) ||
      a.key.localeCompare(b.key),
  );
}

/** Show the customer's own words near the handover, never an invented reason.
 * Unknown timestamps fall back to the latest guest message, labelled as such. */
export function attentionGuestMessage(
  messages: ApiMessage[],
  raisedAt: string | null,
) {
  const guests = messages.filter((message) => message.role === "user");
  const raised = timestamp(raisedAt);
  const preceding = guests.filter(
    (message) =>
      raised > 0 && message.timestampMs > 0 && message.timestampMs <= raised,
  );
  const candidates = preceding.length ? preceding : guests;
  const message = [...candidates].sort(
    (a, b) => b.timestampMs - a.timestampMs,
  )[0];
  return {
    message,
    label: preceding.length
      ? "Guest message at escalation"
      : "Latest guest message",
  };
}
