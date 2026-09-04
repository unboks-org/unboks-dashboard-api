import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConversations, useEscalations } from "@/hooks/use-client-api";
import { useHiddenConversations } from "@/hooks/use-hidden-conversations";
import { useBlockedLookup } from "@/hooks/use-blocked-senders";
import { fetchMermaidReservations } from "@/lib/api";
import {
  mapApiConversation,
  normalizeEscalation,
} from "@/lib/conversation-mapper";
import { buildMermaidAttention } from "@/lib/mermaid-attention";
import { tenantKey } from "@/lib/query-keys";

export function useMermaidAttention() {
  const reservations = useQuery({
    queryKey: tenantKey("mermaid-reservations", ""),
    queryFn: () => fetchMermaidReservations(),
    refetchInterval: 10_000,
  });
  const conversations = useConversations();
  const escalations = useEscalations("all");
  const { isHidden } = useHiddenConversations();
  const { isBlocked } = useBlockedLookup();
  const items = useMemo(
    () =>
      buildMermaidAttention(
        Array.isArray(reservations.data) ? reservations.data : [],
        (Array.isArray(conversations.data) ? conversations.data : []).map(
          mapApiConversation,
        ),
        Array.isArray(escalations.data) ? escalations.data : [],
        (keys) => !isHidden(keys) && !isBlocked(keys),
      ),
    [
      reservations.data,
      conversations.data,
      escalations.data,
      isHidden,
      isBlocked,
    ],
  );
  const isLoading =
    reservations.isLoading || conversations.isLoading || escalations.isLoading;
  const isError =
    reservations.isError || conversations.isError || escalations.isError;
  const complete =
    !isLoading &&
    !isError &&
    Array.isArray(reservations.data) &&
    Array.isArray(conversations.data) &&
    Array.isArray(escalations.data) &&
    escalations.data.every((row) => normalizeEscalation(row) !== null);
  return {
    items,
    isLoading,
    isError,
    complete,
    refresh: () =>
      Promise.all([
        reservations.refetch(),
        conversations.refetch(),
        escalations.refetch(),
      ]),
  };
}
