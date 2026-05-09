/**
 * Appointment detector.
 *
 * Reads a `ConversationDetail` (the same shape the Inbox detail pane
 * uses) and decides whether the conversation contains a CONFIRMED
 * appointment that should appear under Workspace → Appointments.
 *
 * Product rule (strict)
 * =====================
 * The Appointments page is the operator's "what's actually booked"
 * view. Anything still in negotiation belongs in Inbox / Escalations,
 * not here. So this detector only emits rows whose status is
 * "confirmed" — every other in-flight state stays out.
 *
 * The lifecycle the detector mirrors:
 *
 *   1. Customer asks for an intake meeting               → Inbox
 *   2. Marina asks for 2 or 3 candidate times            → Inbox
 *   3. Customer offers multiple slots                    → Escalation (backend)
 *   4. Operator picks a slot                             → still Escalation
 *   5. Marina relays the slot and asks for confirmation  → still NOT an
 *      Appointment (the slot has been proposed, not accepted)
 *   6. Customer confirms ("Yes Thursday 09:00 works")    → APPOINTMENT
 *
 * Concretely we require:
 *   - Some message in the thread shows scheduling intent ("meet",
 *     "appointment", "intake", "activate", "book", "schedule",
 *     "demo", "call") OR explicit availability.
 *   - The LATEST message containing BOTH a day token (Monday..Sunday,
 *     "tomorrow", "today") AND a concrete time (HH:mm, H:mm or H.mm)
 *     pins the slot.
 *   - The status resolves to "confirmed" via one of:
 *       a) the chosen message itself contains explicit confirmation
 *          wording from Marina or the operator ("confirmed", "all
 *          set", "see you on", "locked in", "booked"); OR
 *       b) any later assistant/operator message contains that
 *          wording; OR
 *       c) the chosen message is from the customer AND uses
 *          acceptance language ("Yes Thursday 09:00 works"); OR
 *       d) the customer sends an acceptance message AFTER the chosen
 *          slot was proposed by Marina/operator ("Yes", "OK",
 *          "Confirmed", "works for me", "sounds good"...).
 *
 * If none of those hold, the detector returns `null` and no row is
 * created. Customer slot offers ("tomorrow 17:00 or Monday 11:00"),
 * Marina-asks-please-confirm messages, and bare detected slots all
 * stay out of Appointments — they are still visible in Inbox /
 * Escalations where the operator actually works on them.
 *
 * Backend rows (from `GET /appointments`) are NOT routed through this
 * file; they go through `normalizeAppointmentList` and can carry any
 * status the backend chooses, including "pending" or "detected" — the
 * page's status pill still understands those for backend rows.
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
  /\b(meet|meeting|appointment|appt|intake|book|booking|schedule|reschedul\w*|activate|activation|demo|consult\w*|call|session|onboard\w*|kickoff|kick-off)\b/i;
// Availability-style phrasing from the customer.
const AVAILABILITY_RE = /\b(available|availability|works for me|works for us|free|am free|i'?m free|those are my times|my availability)\b/i;

const CONFIRMED_RE =
  /\b(confirmed|all set|is set|see you (?:on |at )|see u (?:on |at )|locked in|booked)\b/i;
const PENDING_RE =
  /\b(passed to the team|team will confirm|they'?ll confirm|they will confirm|will confirm shortly|handed (?:off|over) to the team|forwarded to the team)\b/i;
// Customer-side confirmation language. Per the Marina prompt's
// appointment rules, a conversation becomes a confirmed Appointment
// when the customer accepts the proposed time (e.g. "Yes, Thursday
// 09:00 works"). We only fire this regex on customer messages that
// arrived AFTER the chosen day+time message, so isolated "ok"s
// elsewhere in the thread don't false-positive.
const CUSTOMER_CONFIRM_RE =
  /\b(yes|yep|yeah|sure|ok(?:ay)?|confirmed?|works(?: for me| for us)?|that works|sounds good|perfect|great|deal|done|see you|will be there|i'?ll be there)\b/i;

const TOPIC_RULES: Array<{ re: RegExp; title: string }> = [
  { re: /\bintake\b/i, title: "Intake meeting" },
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

  // Status resolution. We pass the chosen message's index in the
  // original `msgs` array so the fallback can use thread order when
  // timestamps are missing on either side.
  const chosenIdx = msgs.indexOf(chosen.msg);
  const status = pickStatus(chosen.msg, msgs, chosenIdx);

  // STRICT GATE — Appointments page only shows confirmed bookings.
  // Anything still being negotiated (multi-slot offer, Marina asked
  // please-confirm, operator hasn't picked yet) stays in Inbox /
  // Escalations and must not surface here. Backend `/appointments`
  // rows bypass this gate and can still carry pending/detected.
  if (status !== "confirmed") return null;

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

// ---------------------------------------------------------------------------
// Backend-row validator
// ---------------------------------------------------------------------------
//
// Even when the backend `/appointments` endpoint is live, its
// "confirmed" status is not blindly trusted. This validator checks a
// backend row against the linked conversation and either returns the
// row as-is, or returns `null` to hide it.
//
// The rule (mirrors the strict frontend detector):
//   1. If the row's status is NOT "confirmed", return it unchanged. We
//      never second-guess pending / detected rows from the backend.
//   2. If we have no conversation detail to inspect (the conversation
//      isn't in the operator's list, or its detail hasn't loaded yet),
//      trust the backend.
//   3. If the linked conversation has a single, detector-confirmed
//      slot:
//        - Same slot as the backend row → keep (corroborated).
//        - Different slot → hide. This is the "two confirmed
//          appointments from the same conversation that are actually
//          alternative proposed slots" guard the operator asked for.
//   4. If the detector finds NO confirmed slot in the conversation,
//      check for an explicit contradiction: any message that itself
//      offers MULTIPLE candidate slots ("tomorrow 17:00 or Monday
//      11:00"). If contradicted, hide. Otherwise trust the backend
//      (e.g. manual calendar entries with no related discussion).

function normalizeSlotLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/gu, " ");
}

export interface ValidateBackendArgs {
  apt: Appointment;
  /**
   * Linked conversation detail, or null when the conversation isn't
   * in the operator's current list / its detail hasn't loaded.
   */
  detail: ConversationDetail | null;
}

export function validateBackendAppointment({
  apt,
  detail,
}: ValidateBackendArgs): Appointment | null {
  // Rule 1 — never downgrade pending / detected.
  if (apt.status !== "confirmed") return apt;

  // Rule 2 — silence (no detail) means we can't contradict.
  if (!detail) return apt;
  const msgs = Array.isArray(detail.messages) ? detail.messages : [];
  if (msgs.length === 0) return apt;

  // Rule 3 — try to corroborate via the strict detector. The detector
  // only returns a row when it would emit a confirmed appointment, so
  // any non-null result is a positive corroboration of *some* slot.
  const evidence = detectAppointment({
    detail,
    conversationId: apt.conversationId,
    channel: apt.channel,
    customerName: apt.customerName,
  });
  if (evidence) {
    if (normalizeSlotLabel(apt.dateTimeLabel) === normalizeSlotLabel(evidence.dateTimeLabel)) {
      return apt;
    }
    // Detector confirms a different slot in the same conversation.
    // Backend is showing an alternative proposal that was never
    // accepted — hide so the operator never sees two confirmed cards
    // for one customer when only one was actually agreed on.
    return null;
  }

  // Rule 4 — no detector evidence. Look for an explicit contradiction.
  const hasMultiSlotOffer = msgs.some((m) => isMultiSlotOffer(m.content));
  if (hasMultiSlotOffer) return null;

  // No corroboration, no contradiction — trust the backend (manual
  // calendar entries, slot agreed on a different channel, etc.).
  return apt;
}

function pickTopic(msgs: ApiMessage[]): string | null {
  for (const m of msgs) {
    for (const rule of TOPIC_RULES) {
      if (rule.re.test(m.content)) return rule.title;
    }
  }
  return null;
}

/**
 * Returns true when the chosen-msg content offers MORE THAN ONE
 * candidate slot (e.g. "tomorrow 17:00 or Monday 11:00"). A multi-slot
 * message is an availability offer, not a confirmation, even if it
 * carries acceptance-shaped words like "works for me". The detector
 * must never promote a multi-slot offer to a confirmed Appointment.
 *
 * Exported for use by `validateBackendAppointment`, which uses the
 * same heuristic to detect whether the linked conversation contradicts
 * a backend row claiming "confirmed".
 */
export function isMultiSlotOffer(content: string): boolean {
  const dayMatches = content.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/gi) ?? [];
  const timeMatches = content.match(/\b\d{1,2}[:.]\d{2}\b/g) ?? [];
  return dayMatches.length > 1 || timeMatches.length > 1;
}

/**
 * Predicate: is message at index `i` (with `tsMs` timestamp) at OR
 * after the chosen-slot message? Uses real timestamps when both sides
 * have them, otherwise falls back to position in the chronologically
 * ordered `msgs` array.
 */
function isAtOrAfterChosen(
  i: number,
  tsMs: number,
  chosenIdx: number,
  chosenMs: number,
): boolean {
  if (chosenMs > 0 && tsMs > 0) return tsMs >= chosenMs;
  if (chosenIdx >= 0) return i >= chosenIdx;
  return false;
}

function pickStatus(
  chosenMsg: ApiMessage,
  msgs: ApiMessage[],
  chosenIdx: number,
): AppointmentStatus {
  const chosenMs = chosenMsg.timestampMs;

  // 1. Wording on the message that pinned the slot itself wins.
  if (PENDING_RE.test(chosenMsg.content)) return "pending";
  if (CONFIRMED_RE.test(chosenMsg.content)) return "confirmed";

  // 1b. The chosen message IS the customer accepting a single slot
  //     in one breath ("Yes, Thursday 09:00 works for me"). We
  //     explicitly REJECT multi-slot availability offers here — a
  //     customer saying "tomorrow 17:00 or Monday 11:00 works" is
  //     offering choices, not confirming a booking. Step 3 wouldn't
  //     otherwise fire because it only looks at user messages
  //     strictly AFTER the chosen one.
  if (
    chosenMsg.role === "user" &&
    CUSTOMER_CONFIRM_RE.test(chosenMsg.content) &&
    !isMultiSlotOffer(chosenMsg.content)
  ) {
    return "confirmed";
  }

  // 2. Scan assistant + operator (human team) messages AT OR AFTER
  //    the chosen slot for confirm / pending-handoff language. We
  //    intentionally ignore EARLIER confirmations — an old "confirmed"
  //    from a previous appointment cycle in the same thread must not
  //    promote a brand-new "please confirm Thursday 09:00" proposal
  //    to confirmed. Operator confirmations count too: per the prompt
  //    rules, "operator/team selected a time and confirmed" yields a
  //    confirmed booking even before the customer replies.
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role !== "assistant" && m.role !== "operator") continue;
    if (!isAtOrAfterChosen(i, m.timestampMs, chosenIdx, chosenMs)) continue;
    if (PENDING_RE.test(m.content)) return "pending";
    if (CONFIRMED_RE.test(m.content)) return "confirmed";
  }

  // 3. Customer accepted the slot in a LATER reply. The flow is:
  //    Marina/operator proposes "Thursday 09:00, can you confirm?",
  //    customer replies "Yes" → that "yes" upgrades the row to
  //    confirmed. We require the customer message to come strictly
  //    AFTER the chosen day+time message so a generic "ok" earlier in
  //    the thread (e.g. acknowledging an unrelated step) cannot
  //    false-positive. We also reject customer replies that themselves
  //    offer multiple slots — those are counter-proposals, not
  //    confirmations.
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role !== "user") continue;
    const isStrictlyLater =
      chosenMs > 0 && m.timestampMs > 0
        ? m.timestampMs > chosenMs
        : chosenIdx >= 0
          ? i > chosenIdx
          : false;
    if (!isStrictlyLater) continue;
    if (isMultiSlotOffer(m.content)) continue;
    if (CUSTOMER_CONFIRM_RE.test(m.content)) return "confirmed";
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
