import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  blockConversation,
  unblockConversation,
  fetchBlockedSenders,
  type BlockConversationPayload,
  type BlockedSender,
} from "@/lib/api";

const QUERY_KEY = ["blocked-senders"] as const;

export function useBlockedSenders() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchBlockedSenders,
    staleTime: 30_000,
    retry: 1,
  });
}

function invalidateConversationCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: QUERY_KEY });
  qc.invalidateQueries({ queryKey: ["conversations"] });
  qc.invalidateQueries({ queryKey: ["escalations"] });
  qc.invalidateQueries({ queryKey: ["status"] });
}

export function useBlockMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      conversationId,
      payload,
    }: {
      conversationId: string;
      payload: BlockConversationPayload;
    }) => blockConversation(conversationId, payload),
    onSuccess: () => invalidateConversationCaches(qc),
  });
}

export function useUnblockMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => unblockConversation(conversationId),
    onSuccess: () => invalidateConversationCaches(qc),
  });
}

export interface BlockedLookup {
  isBlocked: (keys: ReadonlyArray<string | null | undefined>) => boolean;
  blockedSet: ReadonlySet<string>;
  blocked: BlockedSender[];
}

export function useBlockedLookup(): BlockedLookup {
  const { data } = useBlockedSenders();
  const blocked = useMemo(() => data?.conversations ?? [], [data]);
  const blockedSet = useMemo(() => {
    const s = new Set<string>();
    for (const b of blocked) {
      const id = (b.conversationId ?? "").trim();
      if (id) s.add(id);
    }
    return s;
  }, [blocked]);
  const isBlocked = useCallback(
    (keys: ReadonlyArray<string | null | undefined>): boolean => {
      for (const raw of keys) {
        if (typeof raw !== "string") continue;
        const k = raw.trim();
        if (k && blockedSet.has(k)) return true;
      }
      return false;
    },
    [blockedSet],
  );
  return { isBlocked, blockedSet, blocked };
}
