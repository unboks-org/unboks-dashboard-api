import type { ApiConversation } from "@/lib/api";
import type { Conversation } from "@/data/conversations";
import { platformToChannel } from "@/lib/channel-map";

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
 * Safe display name with priority order:
 * 1. name / customerName / senderName / contactName / profileName (if not ObjectID)
 * 2. email
 * 3. phone (only if it looks like a real phone number, not an ObjectID)
 * 4. from (if not ObjectID)
 * 5. "Unknown contact"
 */
export function safeDisplayName(c: ApiConversation): string {
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
  const rawText =
    validStr(c.lastMessage) ??
    validStr(c.latestMessage) ??
    validStr(c.last_message) ??
    validStr(c.preview) ??
    validStr(c.snippet) ??
    validStr(c.body) ??
    validStr(c.text) ??
    null;

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

/** Canonical conversation mapper — use this in every page/component */
export function mapApiConversation(c: ApiConversation): Conversation {
  const { subject, preview } = safePreview(c);
  return {
    id: c.phone || c._id || "unknown",
    channel: platformToChannel(c.platform),
    sender: safeDisplayName(c),
    subject,
    preview,
    timestamp: c.timestamp || "",
    unread: c.unread ?? false,
    escalated: c.escalated ?? false,
    hasAttachment: c.hasAttachment ?? false,
    escalationMode: (c.escalationMode ?? null) as Conversation["escalationMode"],
    escalationSummary: c.escalationSummary ?? null,
    learningStatus: (c.learningStatus ?? "none") as Conversation["learningStatus"],
  };
}
