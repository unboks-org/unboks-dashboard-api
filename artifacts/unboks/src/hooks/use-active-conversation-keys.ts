import { useMemo } from "react";
import { useConversations } from "@/hooks/use-client-api";
import { mapApiConversation } from "@/lib/conversation-mapper";
import {
  useHiddenConversations,
  collectConversationHideKeys,
} from "@/hooks/use-hidden-conversations";
import { useArchivedConversations } from "@/hooks/use-archived-conversations";

/**
 * Shared "active conversation key set" derivation.
 *
 * Returns the union of every stable identifier (`id` and
 * `conversationKey`) for conversations that are currently part of the
 * active inbox — i.e. live conversations from the API that are NOT
 * hidden (deleted) and NOT archived. The archive check honours the
 * auto-restore-on-new-inbound semantics by passing each row's raw
 * `last_message_at` epoch, so a fresh inbound un-archives the row in
 * every consumer on the same render tick.
 *
 * Why a hook (not inline math):
 * Multiple surfaces need to know "is this conversation still active?"
 * — the sidebar Appointments badge in `DashboardShell` and the
 * Appointments list in `pages/Bookings.tsx`, both of which need to
 * drop appointment rows whose owning conversation has been archived
 * or deleted. Centralising the predicate guarantees the badge and
 * the visible list can never disagree, and that any future surface
 * (Tasks, Analytics filters, etc.) can opt in with a single import.
 *
 * The Set holds *every* identifier for each active row (`id` plus
 * `conversationKey`) so callers can match against whatever shape the
 * appointment / task / analytics row carries — backend rows often
 * reference the routable `conversationKey`, while detected rows
 * reference the original `phone`/`id`. Either lookup hits.
 *
 * Empty state: returns an empty Set while the conversation API is
 * loading or has errored, mirroring `DashboardShell.allConversations`.
 * Callers should treat "empty active set" the same way they treat
 * "no live data yet" — i.e. don't aggressively prune appointments,
 * just don't bump the badge.
 */
export interface ActiveConversationKeys {
  /** Stable id / conversationKey union for every active row. */
  keys: ReadonlySet<string>;
  /** True once the conversations endpoint has resolved (success or
   *  empty). When false, callers should NOT treat `keys.size === 0`
   *  as "no active conversations" — the data simply hasn't loaded. */
  ready: boolean;
}

export function useActiveConversationKeys(): ActiveConversationKeys {
  const { data: apiConversations, isLoading, isError } = useConversations();
  const { isHidden: isRowHidden } = useHiddenConversations();
  const { isArchived: isRowArchived } = useArchivedConversations();

  return useMemo<ActiveConversationKeys>(() => {
    const ready = !isLoading && !isError && Boolean(apiConversations);
    if (!ready || !apiConversations) {
      return { keys: new Set<string>(), ready };
    }
    const out = new Set<string>();
    for (const raw of apiConversations) {
      const c = mapApiConversation(raw);
      const hideKeys = collectConversationHideKeys(c);
      if (isRowHidden(hideKeys)) continue;
      if (isRowArchived(hideKeys, c.timestampMs)) continue;
      if (c.id) out.add(c.id);
      if (c.conversationKey) out.add(c.conversationKey);
    }
    return { keys: out, ready };
  }, [apiConversations, isLoading, isError, isRowHidden, isRowArchived]);
}
