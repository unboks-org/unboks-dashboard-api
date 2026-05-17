import type { Channel } from "@/data/conversations";

/**
 * Per-channel capability rules for inbox cleanup actions.
 *
 * Source of truth: TASK "Implement inbox archive/delete rules by channel
 * type" — Archive is the universal cleanup action; Delete is channel-
 * specific and only meaningful for channels whose upstream provider
 * (and our backend bridge) actually supports a delete/trash operation.
 *
 * Today only Email has a backend delete endpoint
 * (`DELETE /messages/conversations/:id/email?deleteMode=trash`, with a
 * POST `/email/delete` fallback). WhatsApp Business API has no delete
 * primitive at all — pretending otherwise would silently lose nothing
 * but operator trust. Instagram / Facebook / X / TikTok / Telegram
 * are also archive-only until a real provider delete lands.
 *
 * If the backend grows true delete support for another channel, add it
 * to `DELETABLE_CHANNELS` here; the UI flips on automatically.
 */
const DELETABLE_CHANNELS: ReadonlySet<Channel> = new Set<Channel>(["Email"]);

/** True when this channel surface should expose a Delete action. */
export function canDeleteChannel(channel: Channel | null | undefined): boolean {
  if (!channel) return false;
  return DELETABLE_CHANNELS.has(channel);
}

/**
 * Short, operator-facing copy explaining why Delete is unavailable for
 * a given channel. Used inline (e.g. menu hover, tooltip) so the user
 * sees a real reason instead of a disabled button with no context.
 */
export function whyNoDelete(channel: Channel | null | undefined): string {
  if (!channel) return "Delete isn't supported for this conversation.";
  if (channel === "WhatsApp") {
    return "WhatsApp messages can't be deleted by the operator. Use Archive instead.";
  }
  return `${channel} messages don't support delete yet. Use Archive instead.`;
}
