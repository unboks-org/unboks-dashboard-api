import type { ApiConversation } from "@/lib/api";
import type { Channel, Conversation } from "@/data/conversations";
import { platformToChannel } from "@/lib/channel-map";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Format a backend timestamp for the conversation list.
 *
 * Accepts ISO strings (including Python microsecond format
 * `2026-05-06T03:41:31.995398+00:00`), epoch numbers, and `Date`s.
 *
 *  - today          → `9:42 AM`
 *  - yesterday      → `Yesterday`
 *  - within 7 days  → weekday name, e.g. `Monday`
 *  - older          → short date, e.g. `6 May` (or `6 May 2024` if not this year)
 *
 * If the value is missing, invalid, or already a pre-formatted display string
 * (e.g. legacy mock data like `"9:42 AM"` or `"3 Nov"`), the original string
 * is returned unchanged so we never regress existing UI.
 */
export function formatConversationTimestamp(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    return "";
  }
  if (typeof value === "string" && value.trim() === "") return "";

  // Heuristic: only try to parse ISO-ish or numeric inputs. Bare display
  // strings like "9:42 AM", "Yesterday", "Monday", "3 Nov" should pass
  // through untouched so legacy mock data keeps rendering.
  const looksLikeIso =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value);
  if (typeof value === "string" && !looksLikeIso) {
    return value;
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return typeof value === "string" ? value : "";
  }

  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((startOfDay(now) - startOfDay(d)) / dayMs);

  if (diffDays === 0) {
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return WEEKDAYS[d.getDay()];

  const day = d.getDate();
  const mon = MONTHS_SHORT[d.getMonth()];
  if (d.getFullYear() === now.getFullYear()) return `${day} ${mon}`;
  return `${day} ${mon} ${d.getFullYear()}`;
}

/** True if value looks like a MongoDB ObjectID — 24-char hex string */
export function isMongoObjectId(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{24}$/i.test(value);
}

function validStr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Some Unboks backend records encode the channel directly inside the message
 * body using a prefix like:
 *
 *   email::subj:workspace-noreply@google.com:boost productivity with …
 *   whatsapp::Hey, are you open today?
 *
 * Format:
 *   <platform>::                              — bare platform marker
 *   <platform>::subj:<from>:<subject…>        — email-style envelope
 *
 * If we can parse a prefix, we trust it as the strongest channel signal and
 * also extract the human-readable sender / subject.
 */
const PLATFORM_PREFIX_RE = /^([a-z][a-z0-9_-]*)::(.*)$/i;
const SUBJ_PREFIX_RE = /^subj:([^:\n]*?):(.*)$/i;

interface ParsedPrefix {
  channel: Channel;
  sender: string | null;
  subject: string;
  rest: string;
}

function rawLastMessageText(c: ApiConversation): string | null {
  return (
    validStr(c.lastMessage) ??
    validStr(c.latestMessage) ??
    validStr(c.last_message) ??
    validStr(c.preview) ??
    validStr(c.snippet) ??
    validStr(c.body) ??
    validStr(c.text) ??
    null
  );
}

function parsePlatformPrefix(rawText: string | null): ParsedPrefix | null {
  if (!rawText) return null;
  const lines = rawText.split("\n");
  const firstLine = lines[0] ?? "";
  const m = firstLine.match(PLATFORM_PREFIX_RE);
  if (!m) return null;
  const channel = platformToChannel(m[1]);
  if (channel === "Unknown") return null;

  const tail = m[2] ?? "";
  const subj = tail.match(SUBJ_PREFIX_RE);
  let sender: string | null = null;
  let subject: string;
  if (subj) {
    sender = validStr(subj[1]);
    subject = (subj[2] ?? "").trim();
  } else {
    subject = tail.trim();
  }
  const rest = lines.slice(1).join(" ").trim();
  return { channel, sender, subject, rest };
}

/**
 * Safe display name with priority order:
 * 1. parsed prefix sender (e.g. envelope `from`)
 * 2. name / customerName / senderName / contactName / profileName (if not ObjectID)
 * 3. email
 * 4. phone (only if it looks like a real phone number, not an ObjectID)
 * 5. from (if not ObjectID)
 * 6. "Unknown contact"
 */
export function safeDisplayName(c: ApiConversation, prefixSender?: string | null): string {
  const fromPrefix = validStr(prefixSender);
  if (fromPrefix && !isMongoObjectId(fromPrefix)) return fromPrefix;
  const nameCandidates = [
    c.name,
    c.customerName,
    c.senderName,
    c.contactName,
    c.profileName,
  ];
  for (const candidate of nameCandidates) {
    const s = validStr(candidate);
    if (s && !isMongoObjectId(s)) return s;
  }
  const snake = validStr(c.customer_name);
  if (snake && !isMongoObjectId(snake)) return snake;
  const email = validStr(c.email);
  if (email) return email;
  const phone = validStr(c.phone);
  if (phone && !isMongoObjectId(phone)) return phone;
  const from = validStr(c.from);
  if (from && !isMongoObjectId(from)) return from;
  return "Unknown contact";
}

/**
 * Safe message preview with priority order:
 * lastMessage → latestMessage → last_message → preview → snippet → body → text
 * → last item in messages array → { subject: "No preview available", preview: "" }
 */
export function safePreview(c: ApiConversation): { subject: string; preview: string } {
  const rawText = rawLastMessageText(c);

  if (rawText) {
    const parts = rawText.split("\n");
    const subject = (parts[0] ?? "").slice(0, 80) || rawText.slice(0, 80);
    const preview = parts.slice(1).join(" ").trim() || rawText;
    return { subject, preview };
  }

  if (Array.isArray(c.messages) && c.messages.length > 0) {
    const last = c.messages[c.messages.length - 1];
    const msgText =
      validStr(last.content) ?? validStr(last.text) ?? validStr(last.body) ?? null;
    if (msgText) {
      return { subject: msgText.slice(0, 80), preview: msgText };
    }
  }

  return { subject: "No preview available", preview: "" };
}

/**
 * Channel inference, in priority order:
 *
 * 1. Explicit `channel` field from the live Python backend
 *    (`GET /api/<slug>/dashboard/api/messages/conversations` returns
 *    `{ ..., "channel": "whatsapp" }`).
 * 2. Legacy `platform` field, for older API shapes.
 * 3. Parsed `<platform>::` prefix in the message body (some legacy email
 *    records embed it inline).
 * 4. Phone-shaped conversation key → WhatsApp.
 * 5. Otherwise `Unknown` — never silently fall back to Email.
 */
function inferChannel(c: ApiConversation, prefix: ParsedPrefix | null): Channel {
  const fromChannel = platformToChannel(c.channel);
  if (fromChannel !== "Unknown") return fromChannel;
  const fromPlatform = platformToChannel(c.platform);
  if (fromPlatform !== "Unknown") return fromPlatform;
  if (prefix) return prefix.channel;
  const phone = typeof c.phone === "string" ? c.phone.trim() : "";
  if (phone && !isMongoObjectId(phone)) {
    const digits = phone.replace(/[\s().-]/g, "");
    if (/^\+?\d{7,}$/.test(digits)) return "WhatsApp";
  }
  return "Unknown";
}

/** Canonical conversation mapper — use this in every page/component */
export function mapApiConversation(c: ApiConversation): Conversation {
  const rawText = rawLastMessageText(c);
  const prefix = parsePlatformPrefix(rawText);

  let subject: string;
  let preview: string;
  if (prefix) {
    // Use the parsed envelope, hide the raw `email::subj:…` line from the UI.
    subject = (prefix.subject || prefix.rest || "(no subject)").slice(0, 80);
    preview = prefix.rest || prefix.subject || "";
  } else {
    const sp = safePreview(c);
    subject = sp.subject;
    preview = sp.preview;
  }

  return {
    id: c.phone || c._id || "unknown",
    channel: inferChannel(c, prefix),
    sender: safeDisplayName(c, prefix?.sender ?? null),
    subject,
    preview,
    timestamp: formatConversationTimestamp(c.last_message_at || c.timestamp),
    unread: c.unread ?? false,
    escalated: c.escalated ?? false,
    hasAttachment: c.hasAttachment ?? false,
    escalationMode: (c.escalationMode ?? null) as Conversation["escalationMode"],
    escalationSummary: c.escalationSummary ?? null,
    learningStatus: (c.learningStatus ?? "none") as Conversation["learningStatus"],
  };
}
