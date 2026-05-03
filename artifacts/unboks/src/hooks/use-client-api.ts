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
  fetchAvailability,
  fetchConfig,
  fetchStatus,
  fetchScheduleSlots,
  saveScheduleSlots,
  type ScheduleSlot,
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

export function useEscalations() {
  return useQuery({
    queryKey: ["escalations"],
    queryFn: fetchEscalations,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useEscalationMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["escalations"] });

  const resolve = useMutation({ mutationFn: resolveEscalation, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deleteEscalation, onSuccess: invalidate });
  const reply = useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      replyEscalation(id, message),
  });

  return { resolve, remove, reply };
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
