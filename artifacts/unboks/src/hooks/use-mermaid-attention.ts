import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConversations, useEscalations } from "@/hooks/use-client-api";
import { useHiddenConversations } from "@/hooks/use-hidden-conversations";
import { useBlockedLookup } from "@/hooks/use-blocked-senders";
import { useMermaidCrewAssistance } from "@/hooks/use-mermaid-crew-assistance";
import {
  fetchMermaidReservations,
  type MermaidCrewAssistanceQueueItem,
} from "@/lib/api";
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
  const crewAssistance = useMermaidCrewAssistance();
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
  const assistanceItems = useMemo(() => {
    const unique = new Map<string, MermaidCrewAssistanceQueueItem>();
    for (const item of Array.isArray(crewAssistance.data)
      ? crewAssistance.data
      : []) {
      if (
        item.status !== "unacknowledged" ||
        isHidden([
          item.conversationId,
          item.reservationPublicId ?? "",
          item.id,
        ]) ||
        isBlocked([item.conversationId])
      ) {
        continue;
      }
      unique.set(item.id, item);
    }
    return [...unique.values()];
  }, [crewAssistance.data, isHidden, isBlocked]);
  const isLoading =
    reservations.isLoading ||
    conversations.isLoading ||
    escalations.isLoading ||
    crewAssistance.isLoading;
  const isError =
    reservations.isError ||
    conversations.isError ||
    escalations.isError ||
    crewAssistance.isError;
  const complete =
    !isLoading &&
    !isError &&
    Array.isArray(reservations.data) &&
    Array.isArray(conversations.data) &&
    Array.isArray(escalations.data) &&
    Array.isArray(crewAssistance.data) &&
    escalations.data.every((row) => normalizeEscalation(row) !== null);
  return {
    items,
    assistanceItems,
    isLoading,
    isError,
    complete,
    refresh: () =>
      Promise.all([
        reservations.refetch(),
        conversations.refetch(),
        escalations.refetch(),
        crewAssistance.refetch(),
      ]),
  };
}
