import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchResponseTimingSettings,
  saveResponseTimingSettings,
  type ResponseTimingSettings,
  type ResponseTimingValue,
} from "@/lib/api";

const QUERY_KEY = ["response-timing-settings"] as const;

export function useResponseTimingSettings() {
  return useQuery<ResponseTimingSettings>({
    queryKey: QUERY_KEY,
    queryFn: fetchResponseTimingSettings,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useSaveResponseTimingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: ResponseTimingValue) => saveResponseTimingSettings(settings),
    onSuccess: (settings) => {
      qc.setQueryData(QUERY_KEY, settings);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

