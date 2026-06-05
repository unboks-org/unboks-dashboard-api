import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchWorkspaceLabelsSettings,
  saveWorkspaceLabelsSettings,
  type WorkspaceLabelsSettings,
} from "@/lib/api";

export const DEFAULT_BOOKINGS_LABEL = "Appointments";
const QUERY_KEY = ["workspace-labels"] as const;

const FALLBACK: WorkspaceLabelsSettings = {
  bookingsLabel: DEFAULT_BOOKINGS_LABEL,
  defaultBookingsLabel: DEFAULT_BOOKINGS_LABEL,
  presets: ["Appointments", "Bookings", "Orders"],
};

export function useWorkspaceLabels() {
  return useQuery<WorkspaceLabelsSettings>({
    queryKey: QUERY_KEY,
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
      qc.setQueryData(QUERY_KEY, settings);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function workspaceLabelsFallback(): WorkspaceLabelsSettings {
  return FALLBACK;
}
