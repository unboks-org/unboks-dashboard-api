import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchConversations,
  fetchConversation,
  fetchArchivedConversations,
  archiveConversation,
  unarchiveConversation,
  deleteConversation,
  suggestReply,
  fetchEscalations,
  fetchResolvedEscalations,
  resolveEscalation,
  replyEscalation,
  deleteEscalation,
  submitGuidance,
  takeoverEscalation,
  setEscalationMode,
  handbackEscalation,
  fetchLearningEntries,
  approveLearning,
  saveLearning,
  deleteLearning,
  fetchEscalationLearnings,
  suggestEscalationLearning,
  editEscalationLearning,
  approveEscalationLearning,
  dismissEscalationLearning,
  type EscalationLearningStatus,
  type SuggestEscalationLearningPayload,
  fetchAgentLearningPrefs,
  setAgentLearningPrefs,
  DEFAULT_AGENT_LEARNING_PREFS,
  type AgentLearningPrefs,
  fetchAvailability,
  fetchConfig,
  fetchStatus,
  fetchScheduleSlots,
  saveScheduleSlots,
  type ScheduleSlot,
  aiEditorEdit,
  translateMessage,
  replyToEmail,
  forwardEmail,
  deleteEmail,
  type GuidancePayload,
  type ResolvePayload,
  type AIEditorParams,
  type TranslateMessageParams,
  type EmailReplyPayload,
  type EmailForwardPayload,
  type EmailDeletePayload,
} from "@/lib/api";
import { ApiError } from "@/lib/error";

// ------ Conversations ------

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
    staleTime: 30_000,
    // Quiet 10s heartbeat so the inbox list reflects newly-arrived
    // customer messages without the operator having to manually
    // refresh. `refetchIntervalInBackground: false` stops the poll
    // when the tab is hidden, so a backgrounded dashboard doesn't
    // keep hammering the API. React Query merges results into the
    // existing list — selected page / open conversation / scroll
    // position are not reset.
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

export function useConversation(phone: string | null) {
  return useQuery({
    queryKey: ["conversation", phone],
    queryFn: () => fetchConversation(phone!),
    enabled: Boolean(phone),
    staleTime: 30_000,
    // Quiet 10s heartbeat for the currently open conversation
    // detail. `enabled` is gated by `phone`, so this only ticks
    // while a conversation is actually open. The merged result
    // appends new messages to the cached detail, so the open thread
    // never closes or scrolls during a refetch.
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
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

export function useArchivedConversationsList() {
  return useQuery({
    queryKey: ["conversations", "archived"],
    queryFn: fetchArchivedConversations,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useArchiveMutation() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["conversations"] });
  };
  return useMutation({
    mutationFn: (conversationId: string) => archiveConversation(conversationId),
    onSuccess: invalidate,
  });
}

export function useUnarchiveMutation() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["conversations"] });
  };
  return useMutation({
    mutationFn: (conversationId: string) => unarchiveConversation(conversationId),
    onSuccess: invalidate,
  });
}

// ------ Escalations ------

export function useEscalations(mode?: "soft" | "hard" | "all") {
  return useQuery({
    queryKey: ["escalations", mode ?? "all"],
    queryFn: () => fetchEscalations(mode),
    staleTime: 30_000,
    // Quiet 10s heartbeat so newly-raised escalations land in the
    // operator's queue without manual refresh. Background polling
    // is disabled to avoid wasted API calls when the tab is hidden.
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

export function useResolvedEscalations() {
  return useQuery({
    queryKey: ["escalations", "resolved"],
    queryFn: fetchResolvedEscalations,
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
  const handback = useMutation({
    mutationFn: ({ id }: { id: string }) => handbackEscalation(id),
    onSuccess: invalidate,
  });

  return { resolve, remove, reply, guidance, takeover, setMode, handback };
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

// ------ Escalation Learnings (R2-32 / R2-34, Claudia #32) ------
//
// NEW system, deliberately separate from `useLearningEntries` /
// `useLearningMutations` above (which back the legacy `/learning`
// endpoints). All cache keys live under "escalation-learnings" so the
// two systems never collide.

export function useEscalationLearnings(status?: EscalationLearningStatus) {
  return useQuery({
    queryKey: ["escalation-learnings", status ?? "all"],
    queryFn: () => fetchEscalationLearnings(status),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useEscalationLearningMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["escalation-learnings"] });

  const suggest = useMutation({
    mutationFn: ({
      escalationId,
      payload,
    }: {
      escalationId: string;
      payload: SuggestEscalationLearningPayload;
    }) => suggestEscalationLearning(escalationId, payload),
    onSuccess: invalidate,
  });

  const edit = useMutation({
    mutationFn: ({ id, suggestedText }: { id: string; suggestedText: string }) =>
      editEscalationLearning(id, suggestedText),
    onSuccess: invalidate,
  });

  const approve = useMutation({
    mutationFn: ({ id, operator }: { id: string; operator: string }) =>
      approveEscalationLearning(id, operator),
    onSuccess: invalidate,
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => dismissEscalationLearning(id),
    onSuccess: invalidate,
  });

  return { suggest, edit, approve, dismiss };
}

// ------ Agent learning preferences (R2-35 follow-up — backend live) ------
//
// Tenant-scoped, server-persisted via Claudia #35 at
//   GET/PUT /api/{tenant}/dashboard/api/settings/agent-learnings
// Server is source of truth. No localStorage fallback. State syncs
// across browsers, devices, and teammates because every dashboard
// instance reads the same tenant row and writes go straight back.
//
// React Query refetches on mount and on window focus, so opening
// Browser B (or returning to a previously-open tab) picks up changes
// made elsewhere without a manual refresh.

export function useAgentLearningPrefs() {
  return useQuery<AgentLearningPrefs>({
    queryKey: ["agent-learning-prefs"],
    queryFn: fetchAgentLearningPrefs,
    // Treat the value as immediately stale on focus so cross-device
    // changes propagate as soon as the operator returns to the tab.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useAgentLearningPrefsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setAgentLearningPrefs,
    // Optimistic update so the toggle flips instantly while the PUT is
    // in flight. Rolled back on error so the UI never shows a value
    // that isn't on the server.
    onMutate: async (prefs) => {
      await qc.cancelQueries({ queryKey: ["agent-learning-prefs"] });
      const prev = qc.getQueryData<AgentLearningPrefs>(["agent-learning-prefs"]);
      qc.setQueryData(["agent-learning-prefs"], prefs);
      return { prev };
    },
    onError: (_err, _prefs, ctx) => {
      if (ctx?.prev) qc.setQueryData(["agent-learning-prefs"], ctx.prev);
    },
    onSuccess: (server) => {
      qc.setQueryData(["agent-learning-prefs"], server);
    },
  });
}

export { DEFAULT_AGENT_LEARNING_PREFS };

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

// ------ AI Editor ------

export function useAIEditor() {
  return useMutation({
    mutationFn: (params: AIEditorParams) => aiEditorEdit(params),
  });
}

// ------ Message Translation ------
//
// Operator-only read-side translation (see `translateMessage` in lib/api).
// Distinct from `useAIEditor` so the message bubble UI never accidentally
// surfaces AI-Editor copy / styling.

export function useMessageTranslation() {
  return useMutation({
    mutationFn: (params: TranslateMessageParams) => translateMessage(params),
  });
}

// ------ Email actions (Reply / Forward / Delete) ------
//
// All three invalidate the conversation list + the affected detail so
// the UI reflects the backend's new state immediately. Delete also
// clears the open detail cache for the deleted id.

export function useEmailReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, payload }: { conversationId: string; payload: EmailReplyPayload }) =>
      replyToEmail(conversationId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", vars.conversationId] });
    },
  });
}

export function useEmailForward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, payload }: { conversationId: string; payload: EmailForwardPayload }) =>
      forwardEmail(conversationId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["conversation", vars.conversationId] });
    },
  });
}

export function useEmailDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, payload }: { conversationId: string; payload?: EmailDeletePayload }) =>
      deleteEmail(conversationId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.removeQueries({ queryKey: ["conversation", vars.conversationId] });
    },
  });
}
