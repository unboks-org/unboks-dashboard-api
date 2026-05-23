import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAgentPersonality,
  generateAgentPersonalityExamples,
  saveAgentPersonality,
  type AgentPersonalitySettings,
} from "@/lib/api";
import { getClientSlug } from "@/lib/tenant";

function key(slug: string) {
  return ["agent-personality", slug] as const;
}

export function useAgentPersonality() {
  const slug = getClientSlug();
  const queryClient = useQueryClient();
  const queryKey = key(slug);

  const query = useQuery({
    queryKey,
    queryFn: fetchAgentPersonality,
    staleTime: 30_000,
    retry: 1,
  });

  const generateMutation = useMutation({
    mutationFn: generateAgentPersonalityExamples,
  });

  const saveMutation = useMutation({
    mutationFn: saveAgentPersonality,
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      queryClient.invalidateQueries({ queryKey: ["source-of-truth", slug] });
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    loadError: query.error as Error | null,
    generateExamples: (settings: AgentPersonalitySettings) =>
      generateMutation.mutateAsync(settings),
    isGenerating: generateMutation.isPending,
    save: (settings: AgentPersonalitySettings) => saveMutation.mutateAsync(settings),
    isSaving: saveMutation.isPending,
  };
}
