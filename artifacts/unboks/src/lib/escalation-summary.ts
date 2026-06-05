/**
 * escalation-summary — frontend briefing builder for the Escalation
 * Reason panel.
 *
 * The backend doesn't yet ship structured `customerRequest` / `nextAction`
 * fields, and the previous panel filled the gap with generic copy ("Marina
 * needs human guidance...") that taught the operator nothing they didn't
 * already know from the mode pill.
 *
 * This module reads the actual conversation messages and extracts concrete
 * details — what topic the customer is on, whether they proposed specific
 * dates/times, whether they asked about pricing, etc. — and turns that into
 * a short operational briefing:
 *
 *   {
 *     reason         : "Calvin wants to schedule an activation call. He
 *                       suggested Wednesday at 10:00 or Thursday at 14:00.
 *                       Marina needs a human to choose which slot works..."
 *     customerWants  : "An activation meeting this week."
 *     marinaNeeds    : "Choose one of Calvin's proposed time slots, ..."
 *     options        : [ "Confirm Wednesday at 10:00", ... ]
 *   }
 *
 * Hard rules
 * ----------
 *  - Never invent customer-specific facts. Every concrete claim must come
 *    from text actually present in the messages (or a backend field).
 *  - When the backend ships a non-empty `summary`, it wins as the reason
 *    (more authoritative than our heuristics) — but we still extract
 *    concrete slots from the message corpus so the option chips can name
 *    them.
 *  - Vague "Marina needs human guidance before replying" copy is used
 *    ONLY when there is genuinely no message data AND no backend summary.
 */

import type { ApiMessage } from "./api";

type EscalationModeForSummary = "soft" | "hard" | "order";

export interface EscalationBriefing {
  reason: string;
  customerWants: string;
  marinaNeeds: string;
  options: string[];
}

interface BuildArgs {
  mode: EscalationModeForSummary;
  summary?: string | null;
  reason?: string | null;
  messages?: ApiMessage[];
  customerName?: string | null;
  /**
   * Backend-supplied "what the customer wants" line. When non-empty,
   * it is used verbatim in place of the local heuristic. The prompt
   * is the source of truth when it speaks.
   */
  customerWants?: string | null;
  /**
   * Backend-supplied "what the operator needs to decide" line. When
   * non-empty, it is used verbatim as the "Suggested next step" row
   * in place of the local heuristic.
   */
  operatorNeedsToDecide?: string | null;
  /**
   * Backend-supplied recommended options. When provided non-empty, EVERY
   * entry MUST be rendered as its own chip in order — no slicing, no
   * collapsing. Local heuristic chips are skipped in this case so the
   * backend stays the source of truth.
   */
  recommendedOptions?: string[] | null;
  /**
   * Backend-extracted scheduling slots, e.g. ["Thursday at 09:00",
   * "Thursday at 12:00"]. Each entry becomes its own "Confirm <time>"
   * option chip. Multiple times are NEVER collapsed into a single chip,
   * and the second/third/etc. entry is NEVER dropped.
   */
  proposedTimes?: string[] | null;
}

// ---------------------------------------------------------------------------
// Topic detection
// ---------------------------------------------------------------------------

type Topic =
  | "meeting"
  | "pricing"
  | "whatsapp"
  | "facebook"
  | "activation"
  | "human"
  | "complaint"
  | "booking"
  | "info";

const TOPIC_RULES: Array<{ topic: Topic; pattern: RegExp }> = [
  {
    topic: "meeting",
    pattern: /\b(meet|meeting|call|schedule|appointment|catch up|chat|jump on|hop on|zoom|google meet|teams|availability|available)\b/i,
  },
  {
    topic: "pricing",
    pattern: /\b(price|pricing|cost|how much|quote|fee|charges?|plans?|tariff)\b/i,
  },
  { topic: "whatsapp", pattern: /\bwhats\s*app\b/i },
  { topic: "facebook", pattern: /\b(facebook|messenger|fb\b|insta|instagram)\b/i },
  {
    topic: "activation",
    pattern: /\b(activate|activation|onboard|onboarding|set up|setup|go live|kick off|launch)\b/i,
  },
  {
    topic: "human",
    pattern: /\b(human|real person|agent|representative|talk to someone|speak to someone)\b/i,
  },
  {
    topic: "complaint",
    pattern: /\b(complain|refund|cancel|unhappy|disappointed|angry|frustrat|broken|doesn'?t work|not working|issue|problem|wrong)\b/i,
  },
  {
    topic: "booking",
    pattern: /\b(booking|reservation|reserve|order|purchase|buy)\b/i,
  },
  {
    topic: "info",
    pattern: /\b(more (info|information|details)|tell me more|what (do|does|is)|how (do|does))\b/i,
  },
];

function detectTopics(text: string): Set<Topic> {
  const found = new Set<Topic>();
  for (const { topic, pattern } of TOPIC_RULES) {
    if (pattern.test(text)) found.add(topic);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Concrete time-slot extraction
// ---------------------------------------------------------------------------
//
// Goal: when the customer wrote something like "Wednesday at 10:00 or
// Thursday at 14:00", surface the actual strings "Wednesday at 10:00" and
// "Thursday at 14:00" — both in the reason line and as option chips
// ("Confirm Wednesday at 10:00").
//
// We deliberately keep the grammar conservative: every extracted slot must
// pair an explicit day token (weekday name OR today/tomorrow/tonight) with
// an explicit time token (HH:MM, with or without am/pm; or a bare H/HH
// with am/pm). Bare numbers without a day or am/pm marker are ignored to
// avoid false positives like "200 customers" or "version 2".

const DAY_TOKENS: Record<string, string> = {
  monday: "Monday", mon: "Monday",
  tuesday: "Tuesday", tue: "Tuesday", tues: "Tuesday",
  wednesday: "Wednesday", wed: "Wednesday",
  thursday: "Thursday", thu: "Thursday", thurs: "Thursday",
  friday: "Friday", fri: "Friday",
  saturday: "Saturday", sat: "Saturday",
  sunday: "Sunday", sun: "Sunday",
  today: "today",
  tomorrow: "tomorrow",
  tonight: "tonight",
  // Light multilingual coverage. Title-cased to the English equivalent so
  // the option chips read consistently in the operator UI.
  maandag: "Monday", dinsdag: "Tuesday", woensdag: "Wednesday",
  donderdag: "Thursday", vrijdag: "Friday", zaterdag: "Saturday", zondag: "Sunday",
  lunes: "Monday", martes: "Tuesday", miercoles: "Wednesday", "miércoles": "Wednesday",
  jueves: "Thursday", viernes: "Friday", sabado: "Saturday", "sábado": "Saturday",
  domingo: "Sunday",
};

const DAY_RE_SOURCE = Object.keys(DAY_TOKENS)
  .sort((a, b) => b.length - a.length) // longest-first so "wednesday" beats "wed"
  .join("|");

// Time format: HH:MM optional am/pm  OR  H/HH am/pm.
const TIME_RE_SOURCE = "(?:\\d{1,2}[:.]\\d{2}\\s*(?:am|pm)?|\\d{1,2}\\s*(?:am|pm))";

// A "slot" = day token, optional "at"/comma/space, time token.
const SLOT_RE = new RegExp(
  `\\b(${DAY_RE_SOURCE})\\b(?:\\s+(?:at|@|,|kl|klockan|om))?\\s+(${TIME_RE_SOURCE})`,
  "gi",
);

// Detect a "this week" / "next week" mention so the customerWants line can
// be more specific even when no concrete day/time is present.
const WEEK_HINT = /\b(this|next)\s+(week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening)\b/i;

// Loose time hint — used only to colour the reason ("suggested a time")
// when no concrete slot was extractable but the message clearly mentions
// some time/day.
const TIME_HINT = new RegExp(
  `\\b(${DAY_RE_SOURCE}|${TIME_RE_SOURCE}|this (?:morning|afternoon|evening|week|weekend)|next (?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\\b`,
  "i",
);

function normalizeTime(raw: string): string {
  // Standardise spacing, lowercase am/pm, and turn `10.00` into `10:00`.
  let t = raw.trim().toLowerCase().replace(".", ":");
  // Re-insert a single space before am/pm if it got eaten ("10am" → "10 am"
  // we leave as-is — concise is fine; but "10:00am" reads cleaner as
  // "10:00 am").
  t = t.replace(/(\d)(am|pm)\b/, "$1 $2");
  // "10 am" → keep, "10:00 am" → keep, "10:00" → keep.
  return t;
}

export interface TimeSlot {
  /** Title-cased day word, e.g. "Wednesday" or "tomorrow". */
  day: string;
  /** Normalised time, e.g. "10:00" or "3 pm". */
  time: string;
  /** Pretty form for display, e.g. "Wednesday at 10:00". */
  pretty: string;
}

export function extractTimeSlots(text: string): TimeSlot[] {
  if (!text) return [];
  const out: TimeSlot[] = [];
  const seen = new Set<string>();
  // Use matchAll so we get all (day, time) pairs in order.
  for (const m of text.matchAll(SLOT_RE)) {
    const dayKey = m[1].toLowerCase();
    const day = DAY_TOKENS[dayKey] ?? m[1];
    const time = normalizeTime(m[2]);
    const key = `${day.toLowerCase()}|${time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Lower-case "today/tomorrow/tonight" stay lowercase; weekday names
    // stay title-cased. Connector "at" if the day is a weekday, no
    // connector for relative words ("tomorrow 10:00" → "tomorrow 10:00").
    const connector = /^[A-Z]/.test(day) ? " at " : " ";
    const pretty = `${day}${connector}${time}`;
    out.push({ day, time, pretty });
    if (out.length >= 8) break; // safety cap so a noisy thread can't explode chips
  }
  return out;
}

/**
 * Parse a backend `proposedTimes` entry into a TimeSlot. Backend strings
 * arrive in many shapes ("Thursday at 09:00", "tomorrow 3 pm", "Mon
 * 14:30", an ISO timestamp, ...). We try the slot regex first; if that
 * fails, fall back to a TimeSlot whose `pretty` is just the trimmed
 * original string so the chip still appears verbatim — never dropped.
 */
function parseProposedTime(raw: string): TimeSlot {
  const trimmed = raw.trim();
  if (trimmed) {
    SLOT_RE.lastIndex = 0;
    const m = SLOT_RE.exec(trimmed);
    if (m) {
      const dayKey = m[1].toLowerCase();
      const day = DAY_TOKENS[dayKey] ?? m[1];
      const time = normalizeTime(m[2]);
      const connector = /^[A-Z]/.test(day) ? " at " : " ";
      return { day, time, pretty: `${day}${connector}${time}` };
    }
  }
  return { day: "", time: "", pretty: trimmed || raw };
}

/**
 * Materialise backend-supplied proposedTimes into TimeSlot[] preserving
 * order and EVERY entry. No dedupe, no slicing — the spec requires that
 * each backend-supplied time produces its own chip, even if two entries
 * happen to normalise to the same pretty text. Empty/non-string entries
 * are the only ones skipped.
 */
function slotsFromProposed(times: string[]): TimeSlot[] {
  const out: TimeSlot[] = [];
  for (const t of times) {
    if (typeof t !== "string") continue;
    const slot = parseProposedTime(t);
    if (!slot.pretty) continue;
    out.push(slot);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Freshness guard — detect when the backend's escalation summary has been
// outdated by a newer customer message.
// ---------------------------------------------------------------------------
//
// The backend summary is captured at escalation-creation time. If the
// customer keeps replying afterwards (very common: "actually, can we do
// Friday at 12 instead?"), that summary becomes stale. Without a guard,
// the operator sees a confident "Customer offered tomorrow 17:00 or
// Monday 11:00" decision panel while the latest message in the same
// thread says "i changed my mind, i wanna change it to friday 12:00".
//
// Detection rules — conservative, so we never accidentally discard a
// still-correct backend summary:
//   1. The latest customer (role === "user") message contains an
//      explicit update marker ("changed my mind", "instead", "actually",
//      "reschedule", "let's move", "can we do ... instead", "forget
//      <day>", "scratch that", "nevermind", ...).
//   2. OR the latest customer message contains concrete time slot(s)
//      that the backend's `proposedTimes` does NOT cover.
//
// When triggered, the override uses ONLY information visible in the
// latest customer message — no invented times or topics.

// Scheduling-change phrases. Bare conversational words like "actually"
// or "instead" / "instead of" are deliberately NOT included — they
// appear all the time in benign non-meeting contexts ("actually that
// sounds good", "instead of the blue one I'll take red"). Each pattern
// below either names a scheduling-change verb
// (move / reschedule / cancel / ...) or pairs a soft word with one,
// and the second-stage `SCHEDULING_VOCAB` check below ensures the
// surrounding message also reads like a scheduling exchange.
const UPDATE_MARKERS =
  /\b(changed?\s+my\s+mind|change\s+(?:it|that|the\s+(?:time|date|booking|appointment|meeting|call|slot))\s+to|(?:do|make|move|book|schedule|reschedule|switch|have|set)\s+(?:it|that|the\s+\w+)?\s*(?:to|for)?\s*\w+\s+instead|actually\s+(?:can\s+(?:we|you|i)|could\s+(?:we|you)|let'?s|i'?d?\s+(?:rather|prefer|like|want|need)|make\s+it|do\s+it|i'?m?\s+(?:not\s+)?(?:free|available|busy)|i\s+can'?t)|reschedule|reschedul(?:ing|ed)|let'?s\s+(?:move|switch|do|make|change|reschedule)|can\s+we\s+(?:do|make|move|switch|change|reschedule|push)|can'?t\s+(?:do|make)\s+(?:that|it|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight)|forget\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|that|it|the\s+\w+)|wanna\s+change|want(?:\s+to)?\s+change|new\s+time|different\s+time|move\s+it\s+to|push\s+(?:it|that)\s+(?:to|back)|scratch\s+that\s*[,.]?\s*(?:do|make|let'?s|book|move|reschedule|switch)|no\s+longer\s+(?:works|available|good)|cancel\s+(?:my|the|that)\s+(?:meeting|call|booking|appointment|reservation|order))\b/i;

// A second-stage check: the marker only triggers an override when the
// conversation actually has scheduling/time signal — either the latest
// message contains a concrete slot or some time-related vocabulary.
// This prevents a stray "scratch that" in a totally unrelated thread
// from blowing away a still-valid backend summary.
const SCHEDULING_VOCAB =
  /\b(meet|meeting|call|schedule|appointment|booking|reservation|reschedul|availability|available|time|slot|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|\d{1,2}[:.]\d{2}|next\s+week|this\s+week)\b/i;

interface FreshnessUpdate {
  /** True when the latest customer message has overtaken the backend summary. */
  updated: boolean;
  /** Slots extracted directly from the latest customer message (may be empty). */
  slots: TimeSlot[];
}

/**
 * Build a normalised "day|time" key set from any string source so we can
 * decide whether a freshly extracted slot was already known to the
 * backend (either via its `proposedTimes` array OR mentioned in the
 * summary / customerWants / operatorNeedsToDecide text).
 */
function slotKeySetFromText(...sources: Array<string | null | undefined>): Set<string> {
  const set = new Set<string>();
  for (const src of sources) {
    if (!src) continue;
    for (const slot of extractTimeSlots(src)) {
      set.add(`${slot.day.toLowerCase()}|${slot.time}`);
    }
  }
  return set;
}

function detectSchedulingUpdate(
  latestUserText: string,
  latestUserSlots: TimeSlot[],
  backendSlots: TimeSlot[],
  backendTextSources: Array<string | null | undefined>,
): FreshnessUpdate {
  if (!latestUserText) return { updated: false, slots: latestUserSlots };
  // Marker phrase only counts when the message also reads like a
  // scheduling exchange — guards against false positives in unrelated
  // contexts (color / plan / product choices).
  if (
    UPDATE_MARKERS.test(latestUserText) &&
    (latestUserSlots.length > 0 || SCHEDULING_VOCAB.test(latestUserText))
  ) {
    return { updated: true, slots: latestUserSlots };
  }
  // No explicit marker — treat as an update when the customer named a
  // concrete time the backend wasn't already aware of (checking both
  // the structured `proposedTimes` array and the free-text backend
  // summary fields, so an empty `proposedTimes` doesn't mask a clearly
  // novel slot).
  if (latestUserSlots.length > 0) {
    const knownKeys = new Set<string>();
    for (const s of backendSlots) {
      knownKeys.add(`${s.day.toLowerCase()}|${s.time}`);
    }
    for (const k of slotKeySetFromText(...backendTextSources)) {
      knownKeys.add(k);
    }
    const novel = latestUserSlots.some(
      (s) => !knownKeys.has(`${s.day.toLowerCase()}|${s.time}`),
    );
    if (novel) return { updated: true, slots: latestUserSlots };
  }
  return { updated: false, slots: latestUserSlots };
}

// ---------------------------------------------------------------------------
// Briefing assembly
// ---------------------------------------------------------------------------

function firstName(name?: string | null): string {
  if (!name) return "The customer";
  const n = name.trim();
  if (!n || n.toLowerCase() === "unknown contact") return "The customer";
  return n.split(/\s+/)[0].replace(/[^\p{L}\p{N}'-]/gu, "") || "The customer";
}

/**
 * Order-agnostic "latest message" picker. We can't assume the input is
 * sorted ascending OR descending — Inbox now passes a newest-first sorted
 * array to render the thread, but other callers may pass raw backend
 * order. Pick by `timestampMs` first; if the whole array has 0 (no
 * parseable timestamps), fall back to the last item in array order
 * (matches the historical assumption that backends emit oldest-first).
 */
function pickLatest(
  messages: ApiMessage[],
  predicate?: (m: ApiMessage) => boolean,
): ApiMessage | null {
  if (messages.length === 0) return null;
  let best: ApiMessage | null = null;
  let bestMs = -1;
  for (const m of messages) {
    if (predicate && !predicate(m)) continue;
    const ms = m.timestampMs ?? 0;
    if (ms > bestMs) {
      bestMs = ms;
      best = m;
    }
  }
  if (best && bestMs > 0) return best;
  // No usable timestamps — fall back to scanning array order. Try tail
  // first (oldest-first backend), then head (newest-first sorted UI).
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (!predicate || predicate(messages[i])) return messages[i];
  }
  return null;
}

function joinSlots(slots: TimeSlot[]): string {
  if (slots.length === 0) return "";
  if (slots.length === 1) return slots[0].pretty;
  if (slots.length === 2) return `${slots[0].pretty} or ${slots[1].pretty}`;
  return `${slots
    .slice(0, -1)
    .map((s) => s.pretty)
    .join(", ")}, or ${slots[slots.length - 1].pretty}`;
}

function topicPhrase(topics: Set<Topic>): string | null {
  const parts: string[] = [];
  if (topics.has("activation") && topics.has("meeting"))
    parts.push("schedule an activation call");
  else if (topics.has("activation")) parts.push("activate the service");
  else if (topics.has("meeting")) parts.push("schedule a meeting");
  if (topics.has("booking")) parts.push("book or order something");
  if (topics.has("pricing")) parts.push("pricing");
  if (topics.has("whatsapp") && topics.has("facebook"))
    parts.push("WhatsApp and Facebook");
  else if (topics.has("whatsapp")) parts.push("WhatsApp");
  else if (topics.has("facebook")) parts.push("Facebook");
  if (topics.has("human")) parts.push("speaking to a human");
  if (topics.has("complaint")) parts.push("a complaint or issue");
  if (parts.length === 0 && topics.has("info")) parts.push("more information");
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function customerWantsLine(
  topics: Set<Topic>,
  slots: TimeSlot[],
  hasWeekHint: boolean,
): string {
  const isMeeting = topics.has("meeting") || topics.has("activation");
  if (isMeeting) {
    const what = topics.has("activation") ? "An activation call" : "A meeting";
    if (slots.length > 0) return `${what} at one of the times they suggested.`;
    if (hasWeekHint) return `${what} this week.`;
    return `${what}.`;
  }
  if (topics.has("pricing")) return "Pricing information.";
  if (topics.has("complaint")) return "Help resolving a problem they raised.";
  if (topics.has("booking")) return "Help with a booking or order.";
  if (topics.has("human")) return "To speak directly with a human.";
  if (topics.has("info")) return "More information about your service.";
  if (topics.has("whatsapp") || topics.has("facebook"))
    return "Information about your messaging channels.";
  return "A reply to their last message.";
}

function marinaNeedsLine(
  mode: EscalationModeForSummary,
  topics: Set<Topic>,
  slots: TimeSlot[],
  hasTimeHint: boolean,
): string {
  if (mode === "order") {
    return "Call the customer to confirm the order details and delivery, then mark the case resolved.";
  }
  const isMeeting = topics.has("meeting") || topics.has("activation");
  if (isMeeting) {
    if (mode === "hard") {
      if (slots.length >= 2)
        return "Confirm one of the proposed slots, suggest another time, or ask the customer for more availability.";
      if (slots.length === 1)
        return `Confirm ${slots[0].pretty}, suggest another time, or ask for more availability.`;
      if (hasTimeHint)
        return "Reply directly with a time, or ask the customer for their availability.";
      return "Reply directly with a time, or ask the customer for their availability.";
    }
    // soft
    if (slots.length >= 2)
      return "Tell your Agent which proposed slot to confirm, suggest another time, or ask it to collect more availability.";
    if (slots.length === 1)
      return `Tell your Agent to confirm ${slots[0].pretty}, suggest another time, or ask for more availability.`;
    if (hasTimeHint)
      return "Tell your Agent whether the proposed time works, or ask for alternatives.";
    return "Tell your Agent to propose a time, or ask the customer for their availability.";
  }
  if (mode === "hard") {
    if (topics.has("pricing"))
      return "Reply directly with pricing, or ask what they need first.";
    if (topics.has("complaint"))
      return "Reply directly to the customer with next steps or a resolution.";
    return "Send a direct reply, request more information, or hand back to your Agent.";
  }
  if (topics.has("pricing"))
    return "Tell your Agent what to quote, or to collect requirements first.";
  if (topics.has("complaint"))
    return "Tell your Agent how to acknowledge the issue and what next step to offer.";
  if (topics.has("human"))
    return "Decide whether to take over directly, or have your Agent set expectations for a human reply.";
  if (topics.has("booking"))
    return "Tell your Agent how to handle the booking or order request.";
  return "Tell your Agent what to answer, ask it to collect more details, or take over yourself.";
}

function optionsList(
  mode: EscalationModeForSummary,
  topics: Set<Topic>,
  slots: TimeSlot[],
): string[] {
  if (mode === "order") {
    return ["Call customer to confirm order", "Add internal note", "Mark resolved"];
  }
  const isMeeting = topics.has("meeting") || topics.has("activation");
  if (isMeeting) {
    // Concrete slot chips when we have them — operator can scan and pick.
    const slotChips =
      slots.length > 0
        ? slots.map((s) => `Confirm ${s.pretty}`)
        : mode === "hard"
          ? ["Reply with a time"]
          : ["Tell Agent to confirm a time"];
    const tail =
      mode === "hard"
        ? [
            "Suggest another time",
            "Ask for more availability",
            "Hand back to Agent",
            "Mark resolved",
          ]
        : [
            "Suggest another time",
            "Ask Agent to collect more availability",
            "Switch to human takeover",
            "Mark resolved",
          ];
    return [...slotChips, ...tail];
  }
  if (topics.has("pricing")) {
    return mode === "hard"
      ? [
          "Reply with pricing",
          "Ask what they need first",
          "Hand back to Agent",
          "Mark resolved",
        ]
      : [
          "Tell Agent what to quote",
          "Ask Agent to collect requirements first",
          "Switch to human takeover",
          "Mark resolved",
        ];
  }
  if (topics.has("complaint")) {
    return mode === "hard"
      ? [
          "Reply with a resolution",
          "Ask for more details",
          "Hand back to Agent",
          "Mark resolved",
        ]
      : [
          "Tell Agent how to acknowledge",
          "Switch to human takeover",
          "Ask Agent to collect details",
          "Mark resolved",
        ];
  }
  if (topics.has("human")) {
    return mode === "hard"
      ? ["Reply directly to customer", "Hand back to Agent", "Mark resolved"]
      : [
          "Switch to human takeover",
          "Tell Agent to set expectations",
          "Mark resolved",
        ];
  }
  if (topics.has("booking")) {
    return mode === "hard"
      ? [
          "Reply with booking details",
          "Ask for missing information",
          "Hand back to Agent",
          "Mark resolved",
        ]
      : [
          "Tell Agent how to handle the booking",
          "Ask Agent to request missing details",
          "Switch to human takeover",
          "Mark resolved",
        ];
  }
  return mode === "hard"
    ? [
        "Reply directly to customer",
        "Ask for more information",
        "Hand back to Agent",
        "Mark resolved",
      ]
    : [
        "Tell Agent what to answer",
        "Ask Agent to request more details",
        "Switch to human takeover",
        "Mark resolved",
      ];
}

function reasonLine(
  name: string,
  mode: EscalationModeForSummary,
  topics: Set<Topic>,
  slots: TimeSlot[],
  hasTimeHint: boolean,
): string {
  if (mode === "order") {
    return `${name} confirmed an order and is waiting for a human call to confirm delivery.`;
  }
  const phrase = topicPhrase(topics);
  const isMeeting = topics.has("meeting") || topics.has("activation");

  if (!phrase) {
    return mode === "hard"
      ? `${name} is waiting for a direct human reply.`
      : `${name} sent a message your Agent is unsure how to answer.`;
  }

  const verb = topics.has("complaint") ? "raised" : "is asking about";
  const head = `${name} ${verb} ${phrase}`;

  // Detail tail — concrete slots take priority over vague hints.
  let detail = "";
  if (isMeeting) {
    if (slots.length > 0) {
      const joined = joinSlots(slots);
      const verb2 = slots.length > 1 ? "suggested" : "suggested";
      detail = ` They ${verb2} ${joined}.`;
    } else if (hasTimeHint) {
      detail = " They mentioned some availability.";
    }
  }

  const closer =
    mode === "hard"
      ? "Your Agent has handed this over for a direct human reply."
      : isMeeting
        ? slots.length > 0
          ? "Your Agent needs a human to choose a slot or suggest another time."
          : "Your Agent needs a human to confirm or propose a time."
        : "Your Agent needs a human to decide the next step.";

  return `${head}.${detail} ${closer}`;
}

// ---------------------------------------------------------------------------

export function buildEscalationBriefing({
  mode,
  summary,
  reason,
  messages = [],
  customerName,
  recommendedOptions,
  proposedTimes,
  customerWants: backendCustomerWants,
  operatorNeedsToDecide: backendOperatorNeedsToDecide,
}: BuildArgs): EscalationBriefing {
  const name = firstName(customerName);
  const trimmedSummary = summary?.trim() ?? "";
  const trimmedReason = reason?.trim() ?? "";

  // Build the corpus from the latest customer message + the latest
  // message overall (which may be Marina's reply). Order-agnostic so it
  // works whether the caller passes oldest-first (raw backend) or
  // newest-first (Inbox's sorted thread). The customer message drives
  // intent; the latest assistant turn occasionally carries clarifying
  // topic/slot words (e.g. "we have a slot Wednesday at 10:00 — does
  // that work?").
  const lastUser = pickLatest(messages, (m) => m.role === "user");
  const lastAny = pickLatest(messages);
  const corpus = [lastUser?.content ?? "", lastAny?.content ?? ""]
    .join(" \n ")
    .trim();

  const hasMessageData = corpus.length > 0;
  const topics = hasMessageData ? detectTopics(corpus) : new Set<Topic>();
  // Slot priority: backend-supplied proposedTimes WIN over local heuristic
  // extraction. Each backend entry must surface as its own chip with no
  // collapsing and no dropping of the second/third time, so we hand the
  // raw list straight to slotsFromProposed (order preserved, no cap).
  const backendSlots =
    Array.isArray(proposedTimes) && proposedTimes.length > 0
      ? slotsFromProposed(proposedTimes)
      : [];
  const localSlots = hasMessageData ? extractTimeSlots(corpus) : [];

  // Freshness guard: has the latest customer message overtaken the
  // backend summary? If so, we ignore backend slots/options/copy and
  // rebuild from the latest customer turn.
  const lastUserText = lastUser?.content ?? "";
  const lastUserSlots = lastUserText ? extractTimeSlots(lastUserText) : [];
  const freshness = detectSchedulingUpdate(
    lastUserText,
    lastUserSlots,
    backendSlots,
    [summary, reason, backendCustomerWants, backendOperatorNeedsToDecide],
  );

  // Slot priority:
  //  - If the customer just updated their availability, use ONLY the
  //    slots from that latest message (so we don't keep showing the
  //    superseded backend times).
  //  - Otherwise, backend-supplied proposedTimes WIN over local
  //    heuristic extraction. Each backend entry surfaces as its own
  //    chip with no collapsing and no dropping of the second/third
  //    time.
  const slots = freshness.updated
    ? freshness.slots
    : backendSlots.length > 0
      ? backendSlots
      : localSlots;
  // If we have backend slots OR a fresh customer time, treat the
  // meeting/scheduling topic as active even when message heuristics
  // didn't flag it.
  if (backendSlots.length > 0 || freshness.updated) topics.add("meeting");
  const hasTimeHint =
    backendSlots.length > 0 ||
    freshness.updated ||
    (hasMessageData && TIME_HINT.test(corpus));
  const hasWeekHint = hasMessageData && WEEK_HINT.test(corpus);

  // Reason: backend-supplied summary wins UNLESS the freshness guard
  // tripped, in which case we synthesize a fresh "What happened" line
  // from the latest customer message so we don't repeat a superseded
  // backend snapshot.
  let reasonText: string;
  if (freshness.updated) {
    if (slots.length > 0) {
      reasonText = `${name} updated their request and now wants ${joinSlots(slots)} instead of the earlier proposed times.`;
    } else {
      reasonText = `${name} updated their request. Their earlier message no longer reflects what they want.`;
    }
  } else if (trimmedSummary.length > 0) {
    reasonText = trimmedSummary;
  } else if (hasMessageData) {
    reasonText = reasonLine(name, mode, topics, slots, hasTimeHint);
  } else {
    reasonText =
      "This conversation was escalated because your Agent needs human input before replying.";
  }

  // Prefer backend-supplied lines when the prompt produces them. The
  // Marina prompt now emits structured `customerWants` and
  // `operatorNeedsToDecide` strings — when present (non-empty) we use
  // them verbatim and skip the local heuristic so the operator reads
  // exactly what the agent intended. Falls back to heuristic copy when
  // the backend hasn't shipped these fields yet.
  const trimmedBackendWants = backendCustomerWants?.trim() ?? "";
  const trimmedBackendNeeds = backendOperatorNeedsToDecide?.trim() ?? "";

  // When the freshness guard tripped, the backend's customerWants /
  // operatorNeedsToDecide describe the superseded request, so we skip
  // them and rebuild from the latest customer message.
  const customerWants = freshness.updated
    ? slots.length > 0
      ? `A meeting on ${joinSlots(slots)}.`
      : "An updated reply based on their latest message."
    : trimmedBackendWants.length > 0
      ? trimmedBackendWants
      : hasMessageData
        ? customerWantsLine(topics, slots, hasWeekHint)
        : mode === "hard"
          ? "A direct reply from a human."
          : "A reply your Agent can send confidently.";

  const marinaNeeds = freshness.updated
    ? slots.length === 1
      ? `Tell your Agent whether ${slots[0].pretty} works, suggest another time, or ask the customer for more availability.`
      : slots.length > 1
        ? "Confirm one of the customer's new proposed slots, suggest another time, or ask for more availability."
        : "Ask the customer to confirm what they want, or take over to clarify directly."
    : trimmedBackendNeeds.length > 0
      ? trimmedBackendNeeds
      : hasMessageData
        ? marinaNeedsLine(mode, topics, slots, hasTimeHint)
        : mode === "hard"
          ? "Send a direct reply, request more information, or hand back to your Agent."
          : "Tell your Agent what to answer, ask it to collect more details, or take over yourself.";

  // Options precedence:
  //  1. Backend-supplied `recommendedOptions` — render EVERY entry as a
  //     chip, in order, with no slicing and no collapsing. The backend
  //     is authoritative when it speaks.
  //  2. Otherwise, derive chips from topics + slots (local heuristic).
  //     When `proposedTimes` was supplied, each entry already became its
  //     own "Confirm <time>" chip via the slots pipeline above.
  const cleanedRecommended = Array.isArray(recommendedOptions)
    ? recommendedOptions
        .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
        .map((o) => o.trim())
    : [];
  // When the freshness guard tripped, the backend's recommendedOptions
  // were generated against the superseded request — they'd suggest
  // confirming times the customer no longer wants. Rebuild option chips
  // from the latest customer message instead.
  const options = freshness.updated
    ? buildFreshOptions(mode, slots)
    : cleanedRecommended.length > 0
      ? cleanedRecommended
      : optionsList(mode, topics, slots);

  // Append the backend `reason` only when the freshness guard didn't
  // trip — appending stale context to a fresh override would re-surface
  // the very information we just removed. When fresh, it's truly
  // distinct extra signal worth preserving alongside the heuristic
  // reason.
  if (
    !freshness.updated &&
    trimmedReason.length > 0 &&
    trimmedReason !== reasonText &&
    !reasonText.includes(trimmedReason)
  ) {
    reasonText = `${reasonText} ${trimmedReason}`;
  }

  return { reason: reasonText, customerWants, marinaNeeds, options };
}

/**
 * Build option chips from the latest customer message after a
 * scheduling update. Mirrors the meeting branch of `optionsList` but
 * always uses the just-extracted `slots` (no backend hand-off chips
 * tailored to the original request).
 */
function buildFreshOptions(mode: EscalationModeForSummary, slots: TimeSlot[]): string[] {
  if (mode === "order") {
    return ["Call customer to confirm order", "Add internal note", "Mark resolved"];
  }
  const slotChips =
    slots.length > 0
      ? slots.map((s) => `Confirm ${s.pretty}`)
      : mode === "hard"
        ? ["Reply with a time"]
        : ["Tell Agent to confirm a time"];
  const tail =
    mode === "hard"
      ? [
          "Suggest another time",
          "Ask for more availability",
          "Hand back to Agent",
          "Mark resolved",
        ]
      : [
          "Suggest another time",
          "Ask Agent to collect more availability",
          "Switch to human takeover",
          "Mark resolved",
        ];
  return [...slotChips, ...tail];
}
