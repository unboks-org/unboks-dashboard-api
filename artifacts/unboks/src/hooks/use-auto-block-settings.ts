import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAutoBlockSettings,
  saveAutoBlockSettings,
  type AutoBlockSettings,
} from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";

const queryKey = () => tenantKey("auto-block-settings");

export function useAutoBlockSettings() {
  return useQuery({
    queryKey: queryKey(),
    queryFn: fetchAutoBlockSettings,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useSaveAutoBlockSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: AutoBlockSettings) => saveAutoBlockSettings(settings),
    onSuccess: (settings) => {
      qc.setQueryData(queryKey(), settings);
      qc.invalidateQueries({ queryKey: queryKey() });
    },
  });
}
