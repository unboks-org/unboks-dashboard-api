import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAgentIdentity,
  saveAgentIdentity,
  type AgentIdentitySettings,
} from "@/lib/api";
import { getClientSlug } from "@/lib/tenant";

function key(slug: string) {
  return ["agent-identity", slug] as const;
}

export function useAgentIdentity() {
  const slug = getClientSlug();
  const queryClient = useQueryClient();
  const queryKey = key(slug);

  const query = useQuery({
    queryKey,
    queryFn: fetchAgentIdentity,
    staleTime: 30_000,
    retry: 1,
  });

  const saveMutation = useMutation({
    mutationFn: saveAgentIdentity,
    onSuccess: (saved: AgentIdentitySettings) => {
      queryClient.setQueryData(queryKey, saved);
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    loadError: query.error as Error | null,
    save: (name: string) => saveMutation.mutateAsync(name),
    isSaving: saveMutation.isPending,
  };
}

