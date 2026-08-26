import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchWorkspaceLabelsSettings,
  saveWorkspaceLabelsSettings,
  type WorkspaceLabelsSettings,
} from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";

export const DEFAULT_BOOKINGS_LABEL = "Appointments";
const queryKey = () => tenantKey("workspace-labels");

const FALLBACK: WorkspaceLabelsSettings = {
  bookingsLabel: DEFAULT_BOOKINGS_LABEL,
  defaultBookingsLabel: DEFAULT_BOOKINGS_LABEL,
  presets: ["Appointments", "Bookings", "Orders"],
};

export function useWorkspaceLabels() {
  return useQuery<WorkspaceLabelsSettings>({
    queryKey: queryKey(),
    queryFn: fetchWorkspaceLabelsSettings,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useBookingsLabel(): { label: string; isLoading: boolean } {
  const { data, isLoading } = useWorkspaceLabels();
  return {
    label: data?.bookingsLabel || DEFAULT_BOOKINGS_LABEL,
    isLoading,
  };
}

export function useSaveWorkspaceLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingsLabel: string) => saveWorkspaceLabelsSettings(bookingsLabel),
    onSuccess: (settings) => {
      qc.setQueryData(queryKey(), settings);
      qc.invalidateQueries({ queryKey: queryKey() });
    },
  });
}

export function workspaceLabelsFallback(): WorkspaceLabelsSettings {
  return FALLBACK;
}
