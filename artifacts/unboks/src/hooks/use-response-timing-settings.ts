import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchResponseTimingSettings,
  saveResponseTimingSettings,
  type ResponseTimingSettings,
  type ResponseTimingValue,
} from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";

const queryKey = () => tenantKey("response-timing-settings");

export function useResponseTimingSettings() {
  return useQuery<ResponseTimingSettings>({
    queryKey: queryKey(),
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
      qc.setQueryData(queryKey(), settings);
      qc.invalidateQueries({ queryKey: queryKey() });
    },
  });
}
