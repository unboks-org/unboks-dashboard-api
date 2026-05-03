import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchDryRunStatus, setDryRun } from "@/lib/api";

export function useDryRun() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dry-run"],
    queryFn: fetchDryRunStatus,
    staleTime: 60_000,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: setDryRun,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dry-run"] }),
  });

  return {
    enabled: query.data?.enabled ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    toggle: (value: boolean) => mutation.mutate(value),
    isSaving: mutation.isPending,
  };
}
