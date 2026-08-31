import type { ApiMessage } from "@/lib/api";

/**
 * Return a new oldest-to-newest message array for the visible chat trail.
 *
 * The backend normally returns chronological history already. Sorting here
 * protects the UI from an out-of-order response without mutating the React
 * Query cache. Messages without a usable timestamp keep their source order
 * after timestamped messages instead of being reversed.
 */
export function orderConversationMessagesChronologically(
  messages: readonly ApiMessage[],
): ApiMessage[] {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const aTimestamp = a.message.timestampMs ?? 0;
      const bTimestamp = b.message.timestampMs ?? 0;
      const aHasTimestamp = aTimestamp > 0;
      const bHasTimestamp = bTimestamp > 0;

      if (aHasTimestamp && bHasTimestamp && aTimestamp !== bTimestamp) {
        return aTimestamp - bTimestamp;
      }
      if (aHasTimestamp !== bHasTimestamp) {
        return aHasTimestamp ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map(({ message }) => message);
}

/** Pick the newest matching message regardless of the caller's array order. */
export function latestConversationMessage(
  messages: readonly ApiMessage[],
  predicate?: (message: ApiMessage) => boolean,
): ApiMessage | null {
  let latest: ApiMessage | null = null;
  let latestTimestamp = -1;
  let latestIndex = -1;

  messages.forEach((message, index) => {
    if (predicate && !predicate(message)) return;
    const timestamp = message.timestampMs ?? 0;
    if (timestamp > latestTimestamp || (timestamp === latestTimestamp && index > latestIndex)) {
      latest = message;
      latestTimestamp = timestamp;
      latestIndex = index;
    }
  });

  return latest;
}
