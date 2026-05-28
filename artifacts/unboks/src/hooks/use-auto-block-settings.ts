import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAutoBlockSettings,
  saveAutoBlockSettings,
  type AutoBlockSettings,
} from "@/lib/api";

const QUERY_KEY = ["auto-block-settings"] as const;

export function useAutoBlockSettings() {
  return useQuery({
    queryKey: QUERY_KEY,
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
      qc.setQueryData(QUERY_KEY, settings);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
