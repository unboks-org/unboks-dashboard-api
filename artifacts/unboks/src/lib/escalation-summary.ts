/**
 * escalation-summary — frontend briefing builder for the Escalation
 * Reason panel.
 *
 * The backend doesn't yet ship structured `customerRequest` / `nextAction`
 * fields, and the previous panel filled the gap with generic copy ("Marina
 * needs human guidance...") that taught the operator nothing they didn't
 * already know from the mode pill.
 *
 * This module reads the actual conversation messages and tries to extract
 * concrete, useful detail — what topic the customer is on, whether they
 * proposed times, whether they asked about pricing, whether they asked for
 * a human, etc. — and turns that into a short operational briefing:
 *
 *   {
 *     reason         : "Calvin wants to schedule a call and proposed a time."
 *     customerWants  : "A meeting or activation call."
 *     marinaNeeds    : "Tell Marina which time to confirm or suggest..."
 *     options        : [ "Confirm the proposed time", ... ]
 *   }
 *
 * Hard rules
 * ----------
 *  - Never invent customer-specific facts. Every concrete claim must come
 *    from text actually present in the messages.
 *  - When the backend DOES ship a non-empty `summary`, it wins as the
 *    reason (it's more authoritative than our heuristics).
 *  - The vague "Marina needs human guidance before replying" copy is used
 *    ONLY when there is genuinely no message data to analyse.
 */

import type { ApiMessage } from "./api";

export interface EscalationBriefing {
  reason: string;
  customerWants: string;
  marinaNeeds: string;
  options: string[];
}

interface BuildArgs {
  mode: "soft" | "hard";
  summary?: string | null;
  reason?: string | null;
  messages?: ApiMessage[];
  customerName?: string | null;
}

// Topic detectors. Each returns true if the topic is mentioned in `text`.
// Rules are intentionally simple word/phrase checks — false positives are
// preferable to silent generic fallback as long as the resulting wording
// stays neutral ("asking about X").
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
    pattern: /\b(meet|meeting|call|schedule|appointment|catch up|chat|jump on|hop on|zoom|google meet|teams)\b/i,
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

// Time / date hints. A loose detector — we don't try to parse the time, we
// just want to mention "and proposed a time" when the message clearly does.
const TIME_HINT =
  /\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm)|today|tomorrow|tonight|this (?:morning|afternoon|evening|week|weekend)|next (?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?)\b/i;
// Multiple time slots (rough): two TIME_HINT-ish things separated by
// "or"/"," — we use a light heuristic on the message rather than counting
// matches because dates can take many forms.
const SLOTS_HINT =
  /\b(?:two|three|2|3) (?:options|times|slots|possibilities)|\boption\s*1\b|\bslot 1\b|\beither .* or\b|\b\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)? (?:or|and) \d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?/i;

function firstName(name?: string | null): string {
  if (!name) return "The customer";
  const n = name.trim();
  if (!n || n.toLowerCase() === "unknown contact") return "The customer";
  // Take the first whitespace-separated chunk; strip trailing punctuation.
  return n.split(/\s+/)[0].replace(/[^\p{L}\p{N}'-]/gu, "") || "The customer";
}

function detectTopics(text: string): Set<Topic> {
  const found = new Set<Topic>();
  for (const { topic, pattern } of TOPIC_RULES) {
    if (pattern.test(text)) found.add(topic);
  }
  return found;
}

function lastUserMessage(messages: ApiMessage[]): ApiMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i];
  }
  return null;
}

// Build a one-line topic phrase like "asking about pricing and activation".
// Returns null when nothing concrete was detected so the caller can fall
// back to the vague safe copy.
function topicPhrase(topics: Set<Topic>): string | null {
  const parts: string[] = [];
  if (topics.has("meeting")) parts.push("schedule a meeting");
  if (topics.has("activation")) parts.push("activate the service");
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

function customerWantsLine(topics: Set<Topic>, hasTimeHint: boolean): string {
  if (topics.has("meeting") || topics.has("activation"))
    return hasTimeHint
      ? "A meeting or activation call, and has suggested availability."
      : "A meeting or activation call.";
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
  mode: "soft" | "hard",
  topics: Set<Topic>,
  hasSlots: boolean,
  hasTimeHint: boolean,
): string {
  if (mode === "hard") {
    if (topics.has("meeting") || topics.has("activation"))
      return hasSlots
        ? "Choose one of the proposed times, suggest another, or ask for more availability."
        : "Reply directly with a time, or ask the customer for their availability.";
    if (topics.has("pricing"))
      return "Reply directly with pricing, or ask what they need first.";
    if (topics.has("complaint"))
      return "Reply directly to the customer with next steps or a resolution.";
    return "Send a direct reply, request more information, or hand back to Marina.";
  }
  // soft
  if (topics.has("meeting") || topics.has("activation")) {
    if (hasSlots)
      return "Tell Marina which time to confirm, suggest another time, or ask Marina to collect more availability.";
    if (hasTimeHint)
      return "Tell Marina whether the proposed time works or ask her to suggest alternatives.";
    return "Tell Marina to propose a time or ask the customer for their availability.";
  }
  if (topics.has("pricing"))
    return "Tell Marina what to quote, or ask her to collect requirements first.";
  if (topics.has("complaint"))
    return "Tell Marina how to acknowledge the issue and what next step to offer.";
  if (topics.has("human"))
    return "Decide whether to take over directly or have Marina set expectations for a human reply.";
  if (topics.has("booking"))
    return "Tell Marina how to handle the booking or order request.";
  return "Tell Marina what to answer, ask her to collect more details, or take over yourself.";
}

function optionsList(
  mode: "soft" | "hard",
  topics: Set<Topic>,
  hasSlots: boolean,
): string[] {
  if (topics.has("meeting") || topics.has("activation")) {
    if (mode === "hard") {
      const opts = hasSlots
        ? ["Confirm first proposed time", "Confirm second proposed time"]
        : ["Reply with a time"];
      return [
        ...opts,
        "Suggest another time",
        "Ask for more availability",
        "Hand back to Marina",
        "Mark resolved",
      ];
    }
    const opts = hasSlots
      ? ["Confirm first proposed time", "Confirm second proposed time"]
      : ["Tell Marina to confirm a time"];
    return [
      ...opts,
      "Suggest another time",
      "Ask Marina to collect more availability",
      "Switch to human takeover",
      "Mark resolved",
    ];
  }
  if (topics.has("pricing")) {
    return mode === "hard"
      ? [
          "Reply with pricing",
          "Ask what they need first",
          "Hand back to Marina",
          "Mark resolved",
        ]
      : [
          "Tell Marina what to quote",
          "Ask Marina to collect requirements first",
          "Switch to human takeover",
          "Mark resolved",
        ];
  }
  if (topics.has("complaint")) {
    return mode === "hard"
      ? [
          "Reply with a resolution",
          "Ask for more details",
          "Hand back to Marina",
          "Mark resolved",
        ]
      : [
          "Tell Marina how to acknowledge",
          "Switch to human takeover",
          "Ask Marina to collect details",
          "Mark resolved",
        ];
  }
  if (topics.has("human")) {
    return mode === "hard"
      ? ["Reply directly to customer", "Hand back to Marina", "Mark resolved"]
      : [
          "Switch to human takeover",
          "Tell Marina to set expectations",
          "Mark resolved",
        ];
  }
  if (topics.has("booking")) {
    return mode === "hard"
      ? [
          "Reply with booking details",
          "Ask for missing information",
          "Hand back to Marina",
          "Mark resolved",
        ]
      : [
          "Tell Marina how to handle the booking",
          "Ask Marina to request missing details",
          "Switch to human takeover",
          "Mark resolved",
        ];
  }
  // Generic but mode-appropriate.
  return mode === "hard"
    ? [
        "Reply directly to customer",
        "Ask for more information",
        "Hand back to Marina",
        "Mark resolved",
      ]
    : [
        "Tell Marina what to answer",
        "Ask Marina to request more details",
        "Switch to human takeover",
        "Mark resolved",
      ];
}

function reasonLine(
  name: string,
  mode: "soft" | "hard",
  topics: Set<Topic>,
  hasSlots: boolean,
  hasTimeHint: boolean,
): string {
  const phrase = topicPhrase(topics);
  if (!phrase) {
    // No identifiable topic — return a slightly less generic line that
    // still names the customer when known. Better than the old "Marina
    // needs human guidance" which told the operator nothing.
    return mode === "hard"
      ? `${name} is waiting for a direct human reply.`
      : `${name} sent a message Marina is unsure how to answer.`;
  }
  const verb = topics.has("complaint") ? "raised" : "is asking about";
  const tail =
    topics.has("meeting") || topics.has("activation")
      ? hasSlots
        ? " and proposed time slots"
        : hasTimeHint
          ? " and suggested a time"
          : ""
      : "";
  if (mode === "hard") {
    return `${name} ${verb} ${phrase}${tail}. Marina has handed this over for a direct human reply.`;
  }
  return `${name} ${verb} ${phrase}${tail}. Marina needs a human to decide the next step.`;
}

export function buildEscalationBriefing({
  mode,
  summary,
  reason,
  messages = [],
  customerName,
}: BuildArgs): EscalationBriefing {
  const name = firstName(customerName);
  const trimmedSummary = summary?.trim() ?? "";
  const trimmedReason = reason?.trim() ?? "";

  // Collect text from the latest customer message AND the most recent
  // assistant message (Marina). The customer message drives intent; the
  // assistant turn occasionally carries clarifying topic words.
  const lastUser = lastUserMessage(messages);
  const corpus = [
    lastUser?.content ?? "",
    messages.length > 0 ? messages[messages.length - 1].content ?? "" : "",
  ]
    .join(" \n ")
    .trim();

  const hasMessageData = corpus.length > 0;
  const topics = hasMessageData ? detectTopics(corpus) : new Set<Topic>();
  const hasTimeHint = hasMessageData && TIME_HINT.test(corpus);
  const hasSlots = hasMessageData && SLOTS_HINT.test(corpus);

  // Reason: backend-supplied summary wins; otherwise our heuristic; only
  // fall back to the vague generic when there is genuinely nothing to go
  // on (no summary AND no message text).
  let reasonText: string;
  if (trimmedSummary.length > 0) {
    reasonText = trimmedSummary;
  } else if (hasMessageData) {
    reasonText = reasonLine(name, mode, topics, hasSlots, hasTimeHint);
  } else {
    reasonText =
      "This conversation was escalated because Marina needs human input before replying.";
  }

  // Customer wants / Marina needs / options also key off the heuristic;
  // when there is no data, return generic-but-mode-appropriate lines.
  const customerWants = hasMessageData
    ? customerWantsLine(topics, hasTimeHint)
    : mode === "hard"
      ? "A direct reply from a human."
      : "A reply Marina can send confidently.";

  const marinaNeeds = hasMessageData
    ? marinaNeedsLine(mode, topics, hasSlots, hasTimeHint)
    : mode === "hard"
      ? "Send a direct reply, request more information, or hand back to Marina."
      : "Tell Marina what to answer, ask her to collect more details, or take over yourself.";

  const options = optionsList(mode, topics, hasSlots);

  // If the backend supplied a `reason` distinct from the summary, append
  // it as a quiet "Why" line by stashing it on the reason text via a
  // sentinel the panel can split on. Simpler: surface as a separate
  // sentence here only if it actually adds information.
  if (
    trimmedReason.length > 0 &&
    trimmedReason !== reasonText &&
    !reasonText.includes(trimmedReason)
  ) {
    reasonText = `${reasonText} ${trimmedReason}`;
  }

  return { reason: reasonText, customerWants, marinaNeeds, options };
}
