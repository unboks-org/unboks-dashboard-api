/**
 * Appointment detector.
 *
 * Reads a `ConversationDetail` (the same shape the Inbox detail pane
 * uses) and decides whether the conversation contains a confirmed or
 * pending appointment that should appear under Workspace → Appointments.
 *
 * Product rule
 * ============
 * An appointment row is produced ONLY when the messages contain enough
 * structured signal that we are not inventing one:
 *
 *   1. The customer (or assistant on the customer's behalf) shows
 *      scheduling intent ("meet", "appointment", "activate", "book",
 *      "schedule", "demo", "call") OR offered availability.
 *   2. Some message contains a concrete day token (Monday..Sunday,
 *      "tomorrow", "today") AND a concrete time (HH:mm, H:mm or H.mm).
 *      The day + time are taken from the LATEST message that has both,
 *      so a Marina/operator confirmation overrides earlier customer
 *      ranges.
 *
 * If only vague scheduling talk is present (e.g. "let's meet sometime
 * next week") the detector returns `null` and no row is created.
 *
 * Status
 * ======
 *  - "confirmed" — assistant confirmation language ("confirmed", "see
 *    you", "is set", "all set").
 *  - "pending"   — Marina-style hand-off language ("passed to the
 *    team", "team will confirm", "they'll confirm shortly").
 *  - "detected"  — neither marker present; we extracted a date/time but
 *    can't prove the team confirmed it.
 *
 * Location extraction
 * ===================
 * Tries to read "at <Place>" optionally followed by "in <City>", from
 * the same message that carries the chosen day + time. We deliberately
 * do not search across messages for the location — operators sometimes
 * change locations during a thread, and stitching a stale location to a
 * new time would mislead. If no location is found, the field is null
 * and the card renders with an em-pattern hyphen placeholder.
 *
 * No em dashes in user-facing strings produced from this file.
 */

import type { Appointment, AppointmentStatus, ConversationDetail, ApiMessage } from "@/lib/api";

const DAY_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i;
// 09:00 / 9:00 / 09.00 / 9.00 — must have minutes to count as concrete.
const TIME_RE = /\b(\d{1,2})[:.](\d{2})\b/;
// Schedule intent keywords. We accept intent on EITHER side — the
// customer asking to meet, or the assistant proposing.
const SCHEDULE_INTENT_RE =
  /\b(meet|meeting|appointment|appt|book|booking|schedule|reschedul\w*|activate|activation|demo|consult\w*|call|session|onboard\w*|kickoff|kick-off)\b/i;
// Availability-style phrasing from the customer.
const AVAILABILITY_RE = /\b(available|availability|works for me|works for us|free|am free|i'?m free|those are my times|my availability)\b/i;

const CONFIRMED_RE =
  /\b(confirmed|all set|is set|see you (?:on |at )|see u (?:on |at )|locked in|booked)\b/i;
const PENDING_RE =
  /\b(passed to the team|team will confirm|they'?ll confirm|they will confirm|will confirm shortly|handed (?:off|over) to the team|forwarded to the team)\b/i;

const TOPIC_RULES: Array<{ re: RegExp; title: string }> = [
  { re: /\b(activate|activation)\b/i, title: "Activation meeting" },
  { re: /\bdemo\b/i, title: "Product demo" },
  { re: /\b(consult\w*)\b/i, title: "Consultation" },
  { re: /\b(onboard\w*|kickoff|kick-off)\b/i, title: "Onboarding meeting" },
  { re: /\b(call|phone call)\b/i, title: "Call" },
  { re: /\b(appointment|appt)\b/i, title: "Appointment" },
  { re: /\b(meet|meeting|session)\b/i, title: "Meeting" },
];

/**
 * Quick preview-string check used by the appointments hook to decide
 * whether to fetch a conversation's full detail. False positives are
 * fine here — they just trigger a cached `useConversation` query that
 * the Inbox almost certainly already populated; false negatives skip
 * detection entirely, so we err inclusive.
 */
export function hasSchedulingSignals(text: string | null | undefined): boolean {
  if (!text) return false;
  if (SCHEDULE_INTENT_RE.test(text)) return true;
  if (AVAILABILITY_RE.test(text)) return true;
  if (DAY_RE.test(text) && TIME_RE.test(text)) return true;
  return false;
}

interface DetectArgs {
  detail: ConversationDetail;
  conversationId: string;
  channel: string;
  customerName: string;
}

export function detectAppointment({
  detail,
  conversationId,
  channel,
  customerName,
}: DetectArgs): Appointment | null {
  const msgs = Array.isArray(detail.messages) ? detail.messages : [];
  if (msgs.length === 0) return null;

  // Need scheduling intent OR explicit availability somewhere in the thread.
  const hasIntent = msgs.some((m) =>
    SCHEDULE_INTENT_RE.test(m.content) || AVAILABILITY_RE.test(m.content),
  );
  if (!hasIntent) return null;

  // Walk newest-first to find the most recent message that carries BOTH
  // a day and a time. That message wins — a Marina confirmation arriving
  // after the customer's range correctly overrides the earlier message.
  // ApiMessage has timestampMs; if missing (0), fall back to array order.
  const ordered = [...msgs].sort((a, b) => {
    if (a.timestampMs && b.timestampMs) return b.timestampMs - a.timestampMs;
    return msgs.indexOf(b) - msgs.indexOf(a);
  });

  let chosen: { msg: ApiMessage; day: string; time: string } | null = null;
  for (const m of ordered) {
    const day = m.content.match(DAY_RE)?.[1];
    const time = m.content.match(TIME_RE)?.[0];
    if (day && time) {
      chosen = { msg: m, day, time };
      break;
    }
  }
  if (!chosen) return null;

  const dateTimeLabel = formatDateTimeLabel(chosen.day, chosen.time);
  const location = extractLocation(chosen.msg.content);

  // Topic detection scans every message because the topic word ("activate")
  // is often spoken by the customer earlier in the thread, while the day +
  // time are pinned by Marina's later confirmation.
  const title = pickTopic(msgs) ?? "Meeting";

  // Status: prefer the chosen confirmation message's wording, then fall
  // back to scanning all assistant messages.
  const status = pickStatus(chosen.msg, msgs);

  // Stable id keyed on the conversation + extracted slot so re-renders
  // (and hook re-runs) don't produce duplicates. The hook also dedups
  // against backend rows using `${conversationId}|${dateTimeLabel}`.
  const id = `detected:${conversationId}:${dateTimeLabel}`;

  // createdAt: the assistant/customer message that pinned the slot.
  // ISO string preferred. timestampMs is parsed at fetch time.
  const createdAtMs = chosen.msg.timestampMs > 0 ? chosen.msg.timestampMs : Date.now();
  const createdAt = new Date(createdAtMs).toISOString();

  return {
    id,
    customerName: customerName || detail.name || "Unknown contact",
    channel: (channel || detail.platform || "unknown").toLowerCase(),
    conversationId,
    title,
    dateTimeLabel,
    location,
    status,
    source: "conversation",
    createdAt,
  };
}

function pickTopic(msgs: ApiMessage[]): string | null {
  for (const m of msgs) {
    for (const rule of TOPIC_RULES) {
      if (rule.re.test(m.content)) return rule.title;
    }
  }
  return null;
}

function pickStatus(chosenMsg: ApiMessage, msgs: ApiMessage[]): AppointmentStatus {
  if (PENDING_RE.test(chosenMsg.content)) return "pending";
  if (CONFIRMED_RE.test(chosenMsg.content)) return "confirmed";
  for (const m of msgs) {
    if (m.role !== "assistant") continue;
    if (PENDING_RE.test(m.content)) return "pending";
    if (CONFIRMED_RE.test(m.content)) return "confirmed";
  }
  return "detected";
}

/**
 * "Thursday" + "09:00" → "Thursday 09:00".
 * "tomorrow" + "9:00" → "Tomorrow 09:00".
 * Times are normalized to two-digit hour : two-digit minute so the page
 * displays consistently regardless of how the operator typed it.
 */
function formatDateTimeLabel(day: string, time: string): string {
  const dayNorm =
    day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
  const m = time.match(/^(\d{1,2})[:.](\d{2})$/);
  let timeNorm = time.replace(".", ":");
  if (m) {
    const hh = m[1].padStart(2, "0");
    timeNorm = `${hh}:${m[2]}`;
  }
  return `${dayNorm} ${timeNorm}`;
}

/**
 * Extract a location phrase from a single message.
 *
 * Handles:
 *   "at Café Paris in Willemstad"  → "Café Paris, Willemstad"
 *   "at the downtown office"       → "the downtown office"
 *   "in Willemstad"                → "Willemstad"
 *
 * Ends the place at sentence punctuation, line break, or the next
 * scheduling/handoff phrase to avoid swallowing things like
 * "at Café Paris in Willemstad, passed to the team".
 *
 * Returns null when nothing looks like a location.
 */
function extractLocation(text: string): string | null {
  // Strip the day+time portion so the location regex doesn't wander
  // into it.
  const cleaned = text.replace(TIME_RE, " ").replace(DAY_RE, " ");

  // 1) "at <Place> in <City>"
  const both = cleaned.match(
    /\bat\s+([^.,;!\n]+?)\s+in\s+([^.,;!\n]+?)(?=[.,;!?\n]|$)/iu,
  );
  if (both) {
    const place = cleanLocPiece(both[1]);
    const city = cleanLocPiece(both[2]);
    if (place && city) return `${place}, ${city}`;
    if (place) return place;
    if (city) return city;
  }

  // 2) "at <Place>"
  const at = cleaned.match(/\bat\s+([^.,;!\n]+?)(?=[.,;!?\n]|$)/iu);
  if (at) {
    const place = cleanLocPiece(at[1]);
    if (place) return place;
  }

  // 3) "in <City>"
  const inCity = cleaned.match(/\bin\s+([^.,;!\n]+?)(?=[.,;!?\n]|$)/iu);
  if (inCity) {
    const city = cleanLocPiece(inCity[1]);
    if (city) return city;
  }

  return null;
}

function cleanLocPiece(s: string): string | null {
  // Trim, drop trailing connectors, and refuse pieces that are purely
  // generic ("us", "you", "me", "noon", etc.) which would produce
  // misleading "at us" rows.
  const t = s
    .replace(/\s+/gu, " ")
    .replace(/^(the\s+)+/iu, (m) => m.trim() + " ")
    .trim()
    .replace(/[.,;!?]+$/u, "")
    .trim();
  if (!t) return null;
  if (/^(us|you|me|noon|midnight|am|pm|home|work)$/iu.test(t)) return null;
  // Refuse if it's just stopword-ish or contains schedule handoff words.
  if (/^(passed|forwarded|handed|the team|team)$/iu.test(t)) return null;
  // Cap length defensively so a runaway sentence can't blow up the card.
  return t.length > 80 ? `${t.slice(0, 77).trim()}...` : t;
}
