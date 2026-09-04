import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acknowledgeMermaidCrewAssistance,
  fetchMermaidCrewAssistance,
} from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";

export function useMermaidCrewAssistance() {
  return useQuery({
    queryKey: tenantKey("mermaid-crew-assistance", "unacknowledged"),
    queryFn: () => fetchMermaidCrewAssistance("unacknowledged"),
    staleTime: 0,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}

export function useAcknowledgeMermaidCrewAssistance() {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: tenantKey("mermaid-crew-assistance"),
      }),
      queryClient.invalidateQueries({
        queryKey: tenantKey("mermaid-reservations"),
      }),
      queryClient.invalidateQueries({
        queryKey: tenantKey("mermaid-reservation"),
      }),
      queryClient.invalidateQueries({ queryKey: tenantKey("conversations") }),
      queryClient.invalidateQueries({ queryKey: tenantKey("conversation") }),
      queryClient.invalidateQueries({
        queryKey: tenantKey("mermaid-customers"),
      }),
    ]);
  };
  return useMutation({
    mutationFn: ({
      id,
      expectedRevision,
      acknowledgedBy,
    }: {
      id: string;
      expectedRevision: number;
      acknowledgedBy: string;
    }) =>
      acknowledgeMermaidCrewAssistance(
        id,
        expectedRevision,
        acknowledgedBy,
      ),
    // A stale-revision failure means the guest corrected the note or date.
    // Refetch on both success and failure so the operator immediately sees the
    // current revision instead of acknowledging obsolete information.
    onSettled: invalidate,
  });
}
