import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchConversations,
  fetchConversation,
  deleteConversation,
  suggestReply,
  fetchEscalations,
  resolveEscalation,
  replyEscalation,
  deleteEscalation,
  submitGuidance,
  takeoverEscalation,
  setEscalationMode,
  fetchLearningEntries,
  approveLearning,
  saveLearning,
  deleteLearning,
  fetchAvailability,
  fetchConfig,
  fetchStatus,
  fetchScheduleSlots,
  saveScheduleSlots,
  type ScheduleSlot,
  type GuidancePayload,
  type ResolvePayload,
} from "@/lib/api";

// ------ Conversations ------

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useConversation(phone: string | null) {
  return useQuery({
    queryKey: ["conversation", phone],
    queryFn: () => fetchConversation(phone!),
    enabled: Boolean(phone),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useSuggestReply() {
  return useMutation({ mutationFn: (phone: string) => suggestReply(phone) });
}

// ------ Escalations ------

export function useEscalations(mode?: "soft" | "hard" | "all") {
  return useQuery({
    queryKey: ["escalations", mode ?? "all"],
    queryFn: () => fetchEscalations(mode),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useEscalationMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["escalations"] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
    qc.invalidateQueries({ queryKey: ["conversation"] });
    qc.invalidateQueries({ queryKey: ["status"] });
  };

  const resolve = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: ResolvePayload }) =>
      resolveEscalation(id, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: deleteEscalation, onSuccess: invalidate });
  const reply = useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      replyEscalation(id, message),
    onSuccess: invalidate,
  });
  const guidance = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: GuidancePayload }) =>
      submitGuidance(id, payload),
    onSuccess: invalidate,
  });
  const takeover = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      takeoverEscalation(id, note),
    onSuccess: invalidate,
  });
  const setMode = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: "soft" | "hard" }) =>
      setEscalationMode(id, mode),
    onSuccess: invalidate,
  });

  return { resolve, remove, reply, guidance, takeover, setMode };
}

// ------ Learning entries ------

export function useLearningEntries(status?: string) {
  return useQuery({
    queryKey: ["learning", status ?? "all"],
    queryFn: () => fetchLearningEntries(status),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useLearningMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["learning"] });
  const approve = useMutation({ mutationFn: approveLearning, onSuccess: invalidate });
  const save = useMutation({ mutationFn: saveLearning, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deleteLearning, onSuccess: invalidate });
  return { approve, save, remove };
}

// ------ Availability (Bookings) ------

export function useAvailability(days = 7) {
  return useQuery({
    queryKey: ["availability", days],
    queryFn: () => fetchAvailability(days),
    staleTime: 60_000,
    retry: 1,
  });
}

// ------ Config ------

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: fetchConfig,
    staleTime: 120_000,
    retry: 1,
  });
}

// ------ Schedule ------

export function useScheduleSlots() {
  return useQuery({
    queryKey: ["schedule-slots"],
    queryFn: fetchScheduleSlots,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useScheduleSlotMutations() {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (slots: ScheduleSlot[]) => saveScheduleSlots(slots),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule-slots"] }),
  });
  return { save, isSaving: save.isPending };
}

// ------ Status / Analytics ------

export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: fetchStatus,
    staleTime: 60_000,
    retry: 1,
  });
}
