import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import {
  DashboardShell,
  inboxContextUrl,
  navIdFromInboxUrl,
  PENDING_NAV_KEY,
} from "@/components/inbox/DashboardShell";
import { MessageRow } from "@/components/inbox/MessageRow";
import type { Channel, Conversation } from "@/data/conversations";
import {
  useConversations,
  useConversation,
  useEscalations,
  useEscalationMutations,
  useArchivedConversationsList,
  useArchiveMutation,
  useUnarchiveMutation,
  useResolvedEscalations,
} from "@/hooks/use-client-api";
import {
  mapApiConversation,
  normalizeEscalation,
  escalationToConversationRow,
} from "@/lib/conversation-mapper";
import { dedupeEscalations } from "@/lib/dedupe-escalations";
import { useDeepLink, clearDeepLinkQuery } from "@/lib/deep-link";
import { CHANNEL_BADGE_COLORS } from "@/lib/channel-map";
import type { NavId } from "@/components/inbox/Drawer";
import { useEnabledChannels } from "@/hooks/use-enabled-channels";
import {
  useHiddenConversations,
  collectConversationHideKeys,
} from "@/hooks/use-hidden-conversations";
import { canDeleteChannel } from "@/lib/channel-rules";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  X,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Reply,
  Forward,
  Trash2,
  Archive,
  ArchiveRestore,
  Ban,
  Users,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import type { ApiMessage, ConversationDetail } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { EscalationReplyComposer } from "@/components/inbox/EscalationReplyComposer";
import { SuggestedLearningCard } from "@/components/inbox/SuggestedLearningCard";
import {
  useEscalationLearningMutations,
  useAgentLearningPrefs,
} from "@/hooks/use-client-api";
import { DEFAULT_AGENT_LEARNING_PREFS } from "@/lib/api";
import { useDashboardIdentity } from "@/hooks/use-dashboard-identity";
import type { EscalationLearning } from "@/lib/api";
import { BlockSenderModal } from "@/components/inbox/BlockSenderModal";
import { useBlockedLookup } from "@/hooks/use-blocked-senders";
import {
  EmailReplyModal,
  EmailForwardModal,
  EmailDeleteConfirm,
} from "@/components/inbox/EmailActionsModal";
import { EmailMessageDetail } from "@/components/inbox/EmailMessageDetail";
import { EscalationReasonPanel, type ChipAction } from "@/components/inbox/EscalationReasonPanel";
import type {
  EscalationReplyComposerHandle,
  EscalationDoneContext,
} from "@/components/inbox/EscalationReplyComposer";
import {
  ConversationTranslationBar,
  ConversationTranslationProvider,
  MessageTranslationView,
} from "@/components/inbox/ConversationTranslation";

const EXTERNAL_ROUTES: Partial<Record<NavId, string>> = {
  bookings: "/bookings",
  settings: "/settings",
  analytics: "/analytics",
};

const NAV_LABELS: Record<string, string> = {
  inbox: "Inbox",
  escalations: "Escalations",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function MessageBubble({ msg }: { msg: ApiMessage }) {
  // Three roles, three distinct visual treatments:
  //   - user      → left side, neutral grey  (inbound from customer)
  //   - assistant → right side, blue tint    (Marina, the AI agent)
  //   - operator  → right side, purple tint  (human teammate / takeover reply)
  // Both outbound roles align right since they were sent to the customer,
  // but the color + small role label keeps Marina vs. the human team
  // unambiguous in the trail. Translation, when present for the current
  // global target language and visibility, is rendered inline below the
  // bubble by `MessageTranslationView`, which reads from the
  // conversation-level translation context. There are no per-bubble
  // Translate buttons — the single Translate Conversation toolbar at the
  // top of the thread drives all translations.
  const isUser = msg.role === "user";
  const isOperator = msg.role === "operator";
  const isOutbound = !isUser;

  const bubbleClasses = isUser
    ? "bg-[#f1f3f4] text-[#202124] rounded-bl-sm"
    : isOperator
      ? "bg-[#f3e8ff] text-[#5b3fa0] rounded-br-sm"
      : "bg-[#e8f0fe] text-[#1a73e8] rounded-br-sm";

  const roleLabel = isOperator ? "Team" : isUser ? null : "Agent";
  const roleLabelClass = isOperator
    ? "text-[#5b3fa0]"
    : "text-[#1a73e8]";

  return (
    <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[75%] flex-col",
          isOutbound ? "items-end" : "items-start",
        )}
      >
        {roleLabel && (
          <span
            className={cn(
              "mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em]",
              roleLabelClass,
            )}
          >
            {isOperator ? (
              <Users className="h-3 w-3 flex-shrink-0" />
            ) : (
              <Bot className="h-3 w-3 flex-shrink-0" />
            )}
            {roleLabel}
          </span>
        )}
        <div
          className={cn(
            "px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed",
            bubbleClasses,
          )}
        >
          {msg.content}
          {msg.timestamp && (
            <p className="text-[11px] mt-1 opacity-60">{msg.timestamp}</p>
          )}
        </div>
        {msg.id && (
          <MessageTranslationView
            messageId={msg.id}
            align={isOutbound ? "right" : "left"}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Escalation banner + action panels
// ---------------------------------------------------------------------------
//
// Soft + Hard composers live in EscalationReplyComposer. EscalationModeToggle
// (below) is the persistent switch shown above the message thread so the
// operator can flip soft <-> hard at any time, including when the backend
// hasn't populated escalationMode yet.

// EscalationBanner (yellow/red full-width strip) was retired in favour of a
// compact status pill rendered inline in the conversation header — see
// `EscalationModeToggle`. The escalation summary, when the backend supplies
// one, surfaces as a small helper line directly under the header.

// Statuses that indicate the backend just hasn't shipped this endpoint yet
// (or the network never reached the API). We keep the operator's local pick
// in those cases and surface a calm "Pending sync" notice — never claim the
// backend saved if it didn't.
const NOT_CONNECTED_MODE_STATUSES = new Set([0, 404, 501, 503]);

function isModeNotConnected(err: unknown): boolean {
  if (err instanceof ApiError) return NOT_CONNECTED_MODE_STATUSES.has(err.status);
  return !(err instanceof Error) || err.name === "TypeError" || err.message === "Failed to fetch";
}

interface EscalationModeToggleProps {
  conversationDbId: string;
  selectedMode: "soft" | "hard";
  onChange: (next: "soft" | "hard") => void;
}

/**
 * Persistent mode toggle shown above the message thread for any open
 * escalation. Clicking either button:
 *   1. Updates the local `selectedMode` immediately so the composer below
 *      re-renders without a backend round trip (operator never sees a dead
 *      button).
 *   2. POSTs to /escalations/:id/mode. On 0/404/501/503 we keep the local
 *      pick and show a calm "Mode saved locally" notice. On other errors we
 *      surface the message and still keep the local pick (so the composer
 *      stays correct), but we do NOT claim backend saved it.
 *   3. 401/403 is handled globally by AuthProvider (session-expired toast),
 *      so we don't duplicate that here.
 */
function EscalationModeToggle({
  conversationDbId,
  selectedMode,
  onChange,
}: EscalationModeToggleProps) {
  const { setMode } = useEscalationMutations();
  const [notice, setNotice] = useState<{
    tone: "info" | "error";
    text: string;
  } | null>(null);
  const [pendingMode, setPendingMode] = useState<"soft" | "hard" | null>(null);

  const apply = (next: "soft" | "hard") => {
    if (next === selectedMode || pendingMode) return;
    setNotice(null);
    setPendingMode(next);
    onChange(next);
    setMode.mutate(
      { id: conversationDbId, mode: next },
      {
        onSuccess: () => {
          setPendingMode(null);
        },
        onError: (err) => {
          setPendingMode(null);
          if (isModeNotConnected(err)) {
            setNotice({
              tone: "info",
              text: "Mode saved locally. Backend connection will complete this soon.",
            });
            return;
          }
          // Auth errors are surfaced globally by AuthProvider; for everything
          // else, show calmly and keep the local pick (composer stays right).
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            return;
          }
          setNotice({
            tone: "error",
            text:
              "Mode saved locally, but couldn't sync to backend: " +
              (err instanceof Error ? err.message : "Unknown error"),
          });
        },
      },
    );
  };

  const isSoft = selectedMode === "soft";
  const isHard = selectedMode === "hard";

  return (
    <>
      <div
        role="group"
        aria-label="Escalation mode"
        className="inline-flex rounded-full border border-[#dadce0] p-0.5 bg-[#f8f9fa]"
      >
        <button
          type="button"
          onClick={() => apply("soft")}
          aria-pressed={isSoft}
          disabled={pendingMode === "soft"}
          className={cn(
            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium transition-colors",
            isSoft
              ? "bg-[#fef7e0] text-[#5f3e00] border border-[#feefc3] shadow-sm"
              : "text-[#5f6368] hover:text-[#202124]",
          )}
        >
          <AlertCircle className="w-3 h-3" />
          Agent needs help
        </button>
        <button
          type="button"
          onClick={() => apply("hard")}
          aria-pressed={isHard}
          disabled={pendingMode === "hard"}
          className={cn(
            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium transition-colors",
            isHard
              ? "bg-[#fce8e6] text-[#5f1414] border border-[#f6c6c2] shadow-sm"
              : "text-[#5f6368] hover:text-[#202124]",
          )}
        >
          <AlertTriangle className="w-3 h-3" />
          Human takeover
        </button>
      </div>
      {notice && (
        <div
          role="status"
          className={cn(
            "mt-1.5 rounded-md border px-2.5 py-1 text-[11.5px]",
            notice.tone === "info"
              ? "border-[#cfe2ff] bg-[#f0f6ff] text-[#0b3b8c]"
              : "border-[#f6c6c2] bg-[#fce8e6] text-[#5f1414]",
          )}
        >
          {notice.text}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Conversation detail pane
// ---------------------------------------------------------------------------

interface ConversationDetailPaneProps {
  conversation: Conversation;
  onClose: () => void;
  /**
   * Email-only header actions. Wired through from Inbox so the same handlers
   * power both the row icons and the detail-pane buttons. When omitted (e.g.
   * non-email channel) the action bar is not rendered.
   */
  onEmailReply?: (conv: Conversation) => void;
  onEmailForward?: (conv: Conversation) => void;
  onEmailDelete?: (conv: Conversation) => void;
  /**
   * Channel-agnostic archive / restore. Always wired from the parent so
   * the header surfaces the right action regardless of view; `archived`
   * flips the icon between Archive and ArchiveRestore.
   */
  onArchive?: (conv: Conversation) => void;
  onRestore?: (conv: Conversation) => void;
  archived?: boolean;
  /** "Block in Unboks" handler. Opens the BlockSenderModal at the page
   *  level. Only surfaced when wired from the parent — typically every
   *  active inbox view, but never on the Resolved tab. */
  onBlock?: (conv: Conversation) => void;
  /**
   * When true the pane is rendering a resolved escalation from the Resolved
   * tab. Forces the non-escalation (read-only trail) layout regardless of
   * what the backend detail payload says, suppresses the mode toggle and
   * reply composer, and shows a "Resolved escalation" badge in the header.
   */
  resolvedContext?: boolean;
}

function ConversationDetailPane({
  conversation,
  onClose,
  onEmailReply,
  onEmailForward,
  onEmailDelete,
  onArchive,
  onRestore,
  archived = false,
  onBlock,
  resolvedContext: resolvedContextProp = false,
}: ConversationDetailPaneProps) {
  // Belt-and-suspenders: the prop is set by the parent when
  // `escalationFilter === "resolved"`. The data flag is embedded directly in
  // each resolved escalation row so history mode is enforced even if the
  // parent's filter state doesn't propagate cleanly (e.g. stale closure or
  // re-render timing). Both paths must agree before treating as active.
  const resolvedContext = resolvedContextProp || Boolean(conversation.resolvedEscalation);
  const { data: detail, isLoading, isError, error } = useConversation(conversation.id);
  const badgeColor = CHANNEL_BADGE_COLORS[conversation.channel] ?? "#9aa0a6";
  // Sort newest-first by parsed backend timestamp so the latest message is
  // always at the top of the thread (Inbox / Escalation trail / WhatsApp /
  // Email all share this single render path). Spread first — never mutate
  // the React Query cache array. Messages with timestampMs === 0 (missing
  // or unparseable backend timestamp) sort to the bottom by stable order.
  const messages: ApiMessage[] = useMemo(() => {
    const src = detail?.messages ?? [];
    return [...src].sort((a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0));
  }, [detail?.messages]);
  // Surface the underlying API status/message so an email conversation that
  // 404s (or whose id breaks server-side routing) doesn't render as a blank
  // pane. ApiError carries the HTTP status; fall back to its message string.
  const errorDetail: { status: number | null; message: string } | null = isError
    ? error instanceof ApiError
      ? { status: error.status, message: error.message }
      : { status: null, message: error instanceof Error ? error.message : "Unknown error" }
    : null;
  // Escalation routes use the conversation DB id. Look it up from the
  // escalations list (cached query) via the same normalizer + dedup pass
  // as the list and the sidebar count, so snake_case shapes
  // (`external_id`, etc.) resolve to the same `dbId` as `conversation.id`
  // (which is the normalized phone), and we always target the surviving
  // row when the backend emits duplicates.
  const { data: escalations } = useEscalations("all");
  const dbId = useMemo(() => {
    if (!escalations) return null;
    const active = [];
    for (const raw of escalations as unknown[]) {
      const n = normalizeEscalation(raw);
      if (n && !n.resolved) active.push(n);
    }
    const deduped = dedupeEscalations(active);
    for (const n of deduped) {
      if (n.phone && n.phone === conversation.id) return n.id;
    }
    return null;
  }, [escalations, conversation.id]);

  const showBanner = detail?.escalated && !detail?.escalationResolved;
  const backendMode = detail?.escalationMode ?? null;
  // Hard signals on the detail payload — used to infer the initial mode when
  // the backend hasn't set escalationMode yet, per spec.
  const hasHardSignals = Boolean(
    detail?.aiMuted ||
      (typeof detail?.humanTakeoverAt === "string" && detail.humanTakeoverAt.length > 0),
  );

  // Locally-controlled mode. Initial value comes from the backend; clicks on
  // the toggle update it immediately so the composer below re-renders without
  // waiting for a backend round trip. We re-seed it whenever the open
  // conversation changes (the pane is reused across selections) or once the
  // backend value first becomes known.
  const [selectedMode, setSelectedMode] = useState<"soft" | "hard">(() =>
    backendMode ?? (hasHardSignals ? "hard" : "soft"),
  );
  const lastSeedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!showBanner || !dbId) return;
    const seedKey = `${conversation.id}|${dbId}`;
    if (lastSeedKey.current === seedKey) return;
    lastSeedKey.current = seedKey;
    setSelectedMode(backendMode ?? (hasHardSignals ? "hard" : "soft"));
  }, [showBanner, dbId, conversation.id, backendMode, hasHardSignals]);

  // Decision-first escalation pane: the conversation trail is collapsed
  // by default so the operator's first read is the Escalation reason
  // panel + the composer. They can expand the trail when they need
  // context. Reset to collapsed whenever the open conversation changes
  // so a previously-expanded trail doesn't carry over.
  // resolvedContext forces read-only history layout regardless of the backend
  // detail payload — resolved escalation rows still carry escalated:true but
  // must never surface the reply composer or mode toggle.
  const isEscalation = Boolean(showBanner) && !resolvedContext;
  const [trailOpen, setTrailOpen] = useState(false);
  useEffect(() => {
    setTrailOpen(false);
  }, [conversation.id]);

  // Imperative handle into the Escalation Reply composer so the option
  // chips in the Reason panel can drive it (insert/append draft text,
  // focus, mark resolved, switch to human takeover, hand back). The
  // composer never auto-sends; chips only stage drafts or invoke the
  // existing mutation paths.
  const composerRef = useRef<EscalationReplyComposerHandle | null>(null);

  // ----- Suggested learning flow (R2-32 / R2-34, Claudia #32) -----
  //
  // After Send / Send & Resolve / Resolve produces a non-empty answer,
  // we POST it to /escalations/{id}/suggest-learning to create a pending
  // learning candidate, then mount SuggestedLearningCard so the operator
  // can Approve, Edit, or Dismiss it before the conversation closes.
  // For Resolve with no draft (or Takeover / Handback), the composer
  // calls onDone with no ctx and we close immediately without prompting.
  const [pendingLearning, setPendingLearning] =
    useState<EscalationLearning | null>(null);
  // Reset any in-flight suggestion when the operator navigates to a
  // different conversation; otherwise a stale modal could appear over a
  // new escalation.
  useEffect(() => {
    setPendingLearning(null);
  }, [conversation.id]);
  const { suggest: suggestLearning } = useEscalationLearningMutations();
  const { identity } = useDashboardIdentity();
  const { data: learningPrefs } = useAgentLearningPrefs();
  const handleComposerDone = useCallback(
    (ctx?: EscalationDoneContext) => {
      // No teachable text → close immediately. This covers Takeover,
      // Handback, and bare Resolve with no draft.
      if (!ctx || !ctx.sentText || !dbId) {
        onClose();
        return;
      }
      // R2-35: respect the tenant-scoped behaviour toggles from
      // Settings → Agent learnings (Claudia #35 backend).
      //
      //   createPendingLearningFromOperatorReplies = false
      //     → never POST suggest-learning, never create a pending row,
      //       close immediately. The reply still went to the customer;
      //       the Agent simply does not learn from it.
      //
      //   showSuggestionAfterReplies = false
      //     → still POST suggest-learning so the row exists in
      //       Settings → Agent learnings → Pending for later review,
      //       but skip the modal so the operator's flow is not
      //       interrupted.
      //
      // Defaults are { showSuggestionAfterReplies: true,
      //                createPendingLearningFromOperatorReplies: false }
      // — used only as a fallback if the GET hasn't resolved yet.
      // Critical rule: nothing here ever auto-approves a learning.
      const prefs = learningPrefs ?? DEFAULT_AGENT_LEARNING_PREFS;
      if (!prefs.createPendingLearningFromOperatorReplies) {
        onClose();
        return;
      }
      // Build the source-question payload from the latest customer
      // (role === "user") inbound message — same heuristic as
      // LatestCustomerMessagePreview, so the operator sees consistent
      // context across the pane and the modal.
      const lastInbound = [...messages]
        .reverse()
        .find((m) => m.role === "user");
      const sourceQuestion = lastInbound?.content ?? "";

      suggestLearning.mutate(
        {
          escalationId: dbId,
          payload: {
            suggestedText: ctx.sentText,
            sourceQuestion,
            channel: conversation.channel,
            operator: identity,
          },
        },
        {
          onSuccess: (created) => {
            // Honour showSuggestionAfterReplies: when OFF, the row was
            // created (per the other toggle being ON) but the operator
            // does NOT see the modal — it sits in Settings → Pending
            // for later review.
            if (prefs.showSuggestionAfterReplies) {
              setPendingLearning(created);
            } else {
              onClose();
            }
          },
          onError: () => {
            // Backend isn't ready or rejected the suggestion — never
            // block the operator. We swallow the error here (the post-
            // send flow already succeeded) and close the conversation
            // as before. The Settings "Agent learnings" tab will
            // surface backend issues separately when the operator
            // browses pending entries.
            onClose();
          },
        },
      );
    },
    [
      dbId,
      messages,
      conversation.channel,
      identity,
      onClose,
      suggestLearning,
      learningPrefs,
    ],
  );


  const onChipAction = useCallback((action: ChipAction) => {
    const c = composerRef.current;
    if (!c) return;
    switch (action.kind) {
      case "draft":
        c.insertOrAppend(action.text);
        return;
      case "focus":
        c.focus();
        return;
      case "takeover":
        c.takeover();
        return;
      case "handback":
        c.handback();
        return;
      case "resolve":
        c.markResolved();
        return;
    }
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden border-l border-[#f1f3f4]">
      {/* Header — premium two-row mobile/tablet layout, single row on md+.
          Mobile + tablet (<md):
            Row 1 — back arrow · customer name (truncates) · action icons (right)
            Row 2 — channel badge · status pill (mode toggle) · timestamp
                    (wraps cleanly so pills can never collide with the name)
          Desktop (md+): a single inline row — close · name+timestamp ·
          mode toggle · channel pill+summary · action icons. */}
      <div className="border-b border-[#e8eaed] bg-white px-3 md:px-4 py-2 flex-shrink-0">
        {/* Row 1 — identity + actions */}
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={onClose}
            aria-label="Close conversation"
            className="w-10 h-10 -ml-1 flex items-center justify-center rounded-full hover:bg-[#f1f3f4] text-[#5f6368] md:hidden flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            aria-label="Close conversation"
            className="hidden md:flex w-7 h-7 items-center justify-center rounded-full hover:bg-[#f6f8fc] text-[#5f6368] flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[16px] md:text-[14px] font-semibold text-[#111827] truncate leading-tight">
              {conversation.sender}
            </p>
            {/* md+ inline meta: channel pill + timestamp + summary on one line */}
            <div className="hidden md:flex items-center gap-2 mt-0.5 min-w-0">
              <span
                className="text-[11px] font-medium px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
                style={{ backgroundColor: badgeColor }}
              >
                {conversation.channel}
              </span>
              {resolvedContext && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 bg-[#e6f4ea] text-[#137333]">
                  Resolved escalation
                </span>
              )}
              {conversation.timestamp && (
                <span className="text-[11.5px] text-[#5f6368] flex-shrink-0">
                  {conversation.timestamp}
                </span>
              )}
              {showBanner && !resolvedContext && detail?.escalationSummary && (
                <p className="text-[12px] text-[#5f6368] truncate min-w-0" title={detail.escalationSummary}>
                  {detail.escalationSummary}
                </p>
              )}
            </div>
          </div>
          {/* Mode toggle: stays in row 1 on md+, moves to row 2 on mobile/tablet.
              Hidden in resolvedContext — resolved escalations are read-only. */}
          {showBanner && dbId && !resolvedContext && (
            <div className="hidden md:block flex-shrink-0">
              <EscalationModeToggle
                conversationDbId={dbId}
                selectedMode={selectedMode}
                onChange={setSelectedMode}
              />
            </div>
          )}
          {(onArchive || onRestore) && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {!archived && onArchive && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onArchive(conversation); }}
                  aria-label="Archive conversation"
                  title="Archive"
                  className="w-10 h-10 md:w-8 md:h-8 flex items-center justify-center rounded-full hover:bg-[#eef1f6] text-[#5f6368] hover:text-[#1f2937]"
                >
                  <Archive className="w-5 h-5 md:w-4 md:h-4" />
                </button>
              )}
              {archived && onRestore && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRestore(conversation); }}
                  aria-label="Restore to inbox"
                  title="Restore to inbox"
                  className="w-10 h-10 md:w-8 md:h-8 flex items-center justify-center rounded-full hover:bg-[#e8f0fe] text-[#5f6368] hover:text-[#1a73e8]"
                >
                  <ArchiveRestore className="w-5 h-5 md:w-4 md:h-4" />
                </button>
              )}
              {onBlock && !archived && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onBlock(conversation); }}
                  aria-label="Block in Unboks"
                  title="Block in Unboks"
                  className="w-10 h-10 md:w-8 md:h-8 flex items-center justify-center rounded-full hover:bg-[#fce8e6] text-[#5f6368] hover:text-[#c5221f]"
                >
                  <Ban className="w-5 h-5 md:w-4 md:h-4" />
                </button>
              )}
            </div>
          )}
          {conversation.channel === "Email" && (onEmailReply || onEmailForward || onEmailDelete) && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {onEmailReply && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEmailReply(conversation); }}
                  aria-label="Reply"
                  title="Reply"
                  className="w-10 h-10 md:w-8 md:h-8 flex items-center justify-center rounded-full hover:bg-[#f6f8fc] text-[#5f6368]"
                >
                  <Reply className="w-5 h-5 md:w-4 md:h-4" />
                </button>
              )}
              {onEmailForward && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEmailForward(conversation); }}
                  aria-label="Forward"
                  title="Forward"
                  className="hidden md:flex w-8 h-8 items-center justify-center rounded-full hover:bg-[#f6f8fc] text-[#5f6368]"
                >
                  <Forward className="w-4 h-4" />
                </button>
              )}
              {onEmailDelete && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEmailDelete(conversation); }}
                  aria-label="Delete"
                  title="Delete"
                  className="hidden md:flex w-8 h-8 items-center justify-center rounded-full hover:bg-[#fce8e6] text-[#5f6368] hover:text-[#c5221f]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Row 2 — channel + status (mobile + tablet only, below md). The
            channel pill never shares a line with the customer name on
            narrow screens, so it can never overlap. */}
        <div className="mt-1.5 flex items-center gap-2 flex-wrap md:hidden">
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full text-white flex-shrink-0"
            style={{ backgroundColor: badgeColor }}
          >
            {conversation.channel}
          </span>
          {resolvedContext && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 bg-[#e6f4ea] text-[#137333]">
              Resolved escalation
            </span>
          )}
          {showBanner && dbId && !resolvedContext && (
            <EscalationModeToggle
              conversationDbId={dbId}
              selectedMode={selectedMode}
              onChange={setSelectedMode}
            />
          )}
          {conversation.timestamp && (
            <span className="text-[11.5px] text-[#5f6368] truncate">
              {conversation.timestamp}
            </span>
          )}
        </div>

        {/* Mobile/tablet: escalation summary on its own line — hidden for resolved context */}
        {showBanner && !resolvedContext && detail?.escalationSummary && (
          <p className="md:hidden text-[12.5px] text-[#5f6368] mt-1.5 leading-snug" title={detail.escalationSummary}>
            {detail.escalationSummary}
          </p>
        )}
      </div>

      {isEscalation ? (
        // ----- DECISION-FIRST ESCALATION LAYOUT -------------------------
        // Order: Escalation reason → Composer → Conversation trail.
        // The whole stack scrolls as one column so the panel + composer
        // are always reachable above the (collapsed-by-default) trail,
        // even on short viewports. The translation toolbar lives inside
        // the trail since translations only matter when the operator is
        // actually reading messages.
        //
        // `flex flex-col` + `mt-auto` on the trail wrapper anchors the
        // collapsed-trail toggle to the bottom of the panel when the
        // decision card + composer don't fill the viewport. Without
        // this, short escalations left a large empty area below the
        // composer with the trail toggle floating mid-pane. When the
        // trail is open or content overflows, the `mt-auto` is a no-op
        // and the natural scroll behaviour is preserved exactly.
        <div className="flex-1 overflow-y-auto flex flex-col">
          <EscalationReasonPanel
            mode={selectedMode}
            summary={detail?.escalationSummary}
            reason={detail?.escalationReason}
            aiMuted={detail?.aiMuted}
            messages={messages}
            customerName={conversation.sender}
            recommendedOptions={detail?.recommendedOptions}
            proposedTimes={detail?.extractedDetails?.proposedTimes}
            customerWants={detail?.customerWants}
            operatorNeedsToDecide={detail?.operatorNeedsToDecide}
            onChipAction={onChipAction}
          />

          {/* Latest customer message preview — picks the newest inbound
              message (role === "user"), falling back to the newest
              message overall if no inbound message exists yet. Renders
              as a calm quoted card so the operator can read the
              latest customer context without expanding the trail. */}
          <LatestCustomerMessagePreview messages={messages} />

          {dbId && (
            <EscalationReplyComposer
              // Do NOT key on selectedMode. Remounting would wipe the
              // operator's in-progress draft when they toggle soft/hard.
              ref={composerRef}
              conversationDbId={dbId}
              conversationId={conversation.id}
              mode={selectedMode}
              channel={conversation.channel}
              aiMuted={selectedMode === "hard" ? detail?.aiMuted ?? false : false}
              onDone={handleComposerDone}
            />
          )}

          {/* Suggested-learning modal (R2-32 / R2-34). Mounted only after
              a Send / Send & Resolve / Resolve produces teachable text.
              While it's open, we deliberately do NOT close the
              conversation pane — the operator must explicitly Approve,
              Edit + Save, or Dismiss the suggestion (or close the modal,
              which leaves the row in pending so they can revisit it
              later in Settings). */}
          {pendingLearning && (
            <SuggestedLearningCard
              learning={pendingLearning}
              onDone={() => {
                setPendingLearning(null);
                onClose();
              }}
            />
          )}

          {/* Conversation trail — collapsed by default. The translation
              provider lives inside so its bar appears only when the
              operator opens the trail. The latest customer message is
              already shown above, so the trail is purely secondary. */}
          <ConversationTranslationProvider
            conversationId={conversation.id}
            channel={conversation.channel}
            messages={messages}
          >
            <div className="mt-auto border-t border-[#e8eaed] bg-white">
              <button
                type="button"
                onClick={() => setTrailOpen((v) => !v)}
                aria-expanded={trailOpen}
                aria-controls="conversation-trail"
                // Slightly softer background and a touch more vertical
                // padding so the toggle reads as an intentional footer
                // when `mt-auto` anchors it to the bottom of short
                // escalations, instead of looking like an orphaned
                // button strip floating in white space.
                className="flex w-full items-center gap-2 bg-[#fbfbfd] px-4 py-2.5 text-left text-[12px] font-semibold text-[#5f6368] hover:bg-[#f1f3f4]"
              >
                {trailOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
                )}
                <span>Conversation trail</span>
                {messages.length > 0 && (
                  <span className="text-[11px] font-normal text-[#9aa0a6]">
                    ({messages.length})
                  </span>
                )}
                <span className="ml-auto text-[11px] font-normal text-[#9aa0a6]">
                  {trailOpen ? "Hide conversation" : "Show full conversation"}
                </span>
              </button>
              {trailOpen && (
                <div id="conversation-trail">
                  <ConversationTranslationBar />
                  <ConversationThreadBody
                    isLoading={isLoading}
                    messages={messages}
                    conversation={conversation}
                    errorDetail={errorDetail}
                  />
                </div>
              )}
            </div>
          </ConversationTranslationProvider>
        </div>
      ) : (
        // ----- STANDARD (non-escalation) LAYOUT -------------------------
        // Conversation-first: translation toolbar + full thread, no
        // composer. Unchanged from prior behavior for plain inbox items.
        <ConversationTranslationProvider
          conversationId={conversation.id}
          channel={conversation.channel}
          messages={messages}
        >
          <ConversationTranslationBar />
          <ConversationThreadBody
            isLoading={isLoading}
            messages={messages}
            conversation={conversation}
            errorDetail={errorDetail}
          />
        </ConversationTranslationProvider>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LatestCustomerMessagePreview — quoted card showing the newest inbound
// (role === "user") message so the operator has the latest customer
// context inline with the decision flow, without needing to expand the
// full conversation trail. `messages` is already sorted newest-first
// by ConversationDetailPane, so we take the first match.
// ---------------------------------------------------------------------------
function LatestCustomerMessagePreview({ messages }: { messages: ApiMessage[] }) {
  const latest = useMemo(() => {
    if (!messages || messages.length === 0) return null;
    // Newest inbound first; fall back to the newest message overall if
    // we haven't received an inbound yet (e.g. agent-initiated thread).
    return messages.find((m) => m.role === "user") ?? messages[0];
  }, [messages]);

  if (!latest || !latest.content) return null;

  const isInbound = latest.role === "user";

  return (
    <section
      aria-label="Latest customer message"
      className="bg-white px-3 sm:px-4 pb-3 flex-shrink-0"
    >
      <div className="rounded-xl border border-[#e6e8eb] bg-white px-3.5 py-3 sm:px-4 sm:py-3.5">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5f6368]">
            {isInbound ? "Latest customer message" : "Latest message"}
          </p>
          {latest.timestamp && (
            <span className="text-[11px] text-[#9aa0a6] flex-shrink-0">
              {latest.timestamp}
            </span>
          )}
        </div>
        <p className="text-[13.5px] leading-[1.55] text-[#1f2937] whitespace-pre-wrap break-words">
          {latest.content}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ConversationThreadBody — the message list + empty/error placeholders.
// Extracted so both the standard layout and the collapsible trail in the
// escalation layout can reuse it without duplicating the placeholder logic.
// ---------------------------------------------------------------------------
function ConversationThreadBody({
  isLoading,
  messages,
  conversation,
  errorDetail,
}: {
  isLoading: boolean;
  messages: ApiMessage[];
  conversation: Conversation;
  errorDetail: { status: number | null; message: string } | null;
}) {
  return (
    <div
      className={cn(
        "flex-1 overflow-y-auto px-4 py-4",
        conversation.channel === "Email" ? "space-y-4 bg-[#f8f9fa]" : "space-y-3",
      )}
    >
      {isLoading && (
        <p className="text-[13px] text-[#5f6368] text-center py-8">Loading messages…</p>
      )}

      {!isLoading && messages.length > 0 && (
        conversation.channel === "Email"
          ? messages.map((msg, i) => (
              <EmailMessageDetail key={msg.id ?? i} msg={msg} />
            ))
          : messages.map((msg, i) => (
              <MessageBubble key={msg.id ?? i} msg={msg} />
            ))
      )}

      {!isLoading && messages.length === 0 && (
        <div className="py-8 space-y-3">
          {conversation.subject !== "No preview available" && (
            <div className="bg-[#f1f3f4] rounded-2xl rounded-bl-sm px-4 py-2.5 text-[13px] text-[#202124] text-left max-w-[75%]">
              <p className="font-medium">{conversation.subject}</p>
              {conversation.preview && conversation.preview !== conversation.subject && (
                <p className="text-[#5f6368] mt-1">{conversation.preview}</p>
              )}
            </div>
          )}

          {errorDetail && (
            <div
              role="alert"
              className="mx-auto max-w-[420px] rounded-xl border border-[#fad2cf] bg-[#fce8e6] px-4 py-3 text-left"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#c5221f] flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#5f1414]">
                    Couldn't load conversation
                  </p>
                  <p className="mt-1 text-[12px] text-[#5f6368] break-words">
                    {errorDetail.status
                      ? `${errorDetail.status} · ${errorDetail.message}`
                      : errorDetail.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!errorDetail && conversation.subject === "No preview available" && (
            <p className="text-center text-[13px] text-[#9aa0a6]">No messages to display.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inbox page
// ---------------------------------------------------------------------------

export default function Inbox() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const { isChannelEnabled } = useEnabledChannels();
  const [searchQuery, setSearchQueryState] = useState("");
  // activeNav is derived from the URL — that's how a refresh / crash
  // recovery / 401 bounce restores the same view (Inbox / Escalations
  // / channel filter) instead of dumping the operator on Inbox.
  const [activeNav, setActiveNavState] = useState<NavId>(() =>
    navIdFromInboxUrl(
      typeof window !== "undefined" ? window.location.pathname.replace(
        (import.meta.env.BASE_URL || "/").replace(/\/$/, ""),
        "",
      ) || "/" : "/",
      typeof window !== "undefined" ? window.location.search : "",
      isChannelEnabled,
    ),
  );

  // Keep activeNav in lockstep with the URL: every navigate(...) the
  // sidebar (or Inbox.handleNavSelect) makes updates the URL, this
  // effect syncs local state, and the rendered view follows. Browser
  // back/forward also "just works" — same path = same view.
  useEffect(() => {
    setActiveNavState((prev) => {
      const next = navIdFromInboxUrl(location, search, isChannelEnabled);
      return prev === next ? prev : next;
    });
  }, [location, search, isChannelEnabled]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [escalationFilter, setEscalationFilter] = useState<"all" | "soft" | "hard" | "resolved">("all");

  // Email-only persistent row actions. All three open dedicated modals
  // that call the real backend endpoints:
  //   - Reply   → POST /messages/conversations/:id/email/reply
  //   - Forward → POST /messages/conversations/:id/email/forward
  //   - Delete  → DELETE /messages/conversations/:id/email (POST fallback)
  // The previous placeholders / confirm() / alert() flows are gone.
  // Conversation ids are URL-encoded inside the api client (email ids
  // can contain `:`, `@`, spaces).
  const [emailReplyConv, setEmailReplyConv] = useState<Conversation | null>(null);
  const [emailForwardConv, setEmailForwardConv] = useState<Conversation | null>(null);
  const [emailDeleteConv, setEmailDeleteConv] = useState<Conversation | null>(null);
  // "Block in Unboks" target. Modal is mounted at page-level (same pattern
  // as the email modals) so it overlays the list AND the detail pane on
  // every viewport. Cleared on dismiss / on successful block.
  const [blockConv, setBlockConv] = useState<Conversation | null>(null);

  const handleEmailReply = useCallback((conv: Conversation) => {
    setEmailReplyConv(conv);
  }, []);
  const handleEmailForward = useCallback((conv: Conversation) => {
    setEmailForwardConv(conv);
  }, []);
  const handleEmailDelete = useCallback((conv: Conversation) => {
    setEmailDeleteConv(conv);
  }, []);
  const handleEmailDeleted = useCallback((deletedId: string) => {
    setSelectedConv((cur) => (cur?.id === deletedId ? null : cur));
  }, []);
  const handleBlock = useCallback((conv: Conversation) => {
    setBlockConv(conv);
  }, []);
  const handleBlocked = useCallback((blockedId: string) => {
    // Close the open detail pane if it was on the blocked row — the row
    // itself is removed from the list by the blocked-set filter on the
    // next render once the query invalidates.
    setSelectedConv((cur) => (cur?.id === blockedId ? null : cur));
  }, []);

  // Server-backed blocked senders. The lookup is cheap (Set.has), so
  // every list filter passes through the same predicate the sidebar
  // counts use, guaranteeing badges and rows agree on which senders
  // are suppressed.
  const { isBlocked: isRowBlocked } = useBlockedLookup();

  // Locally-hidden conversation ids (Email/Escalation rows that were
  // removed from the UI either via successful backend delete or via
  // the local-hide fallback for 404/405/501). The hook subscribes to
  // both `storage` and a custom in-tab event, so any list and the
  // sidebar counts re-render the moment the hidden set changes.
  const { isHidden: isRowHidden } = useHiddenConversations();

  // Server-backed archive/unarchive. Brief 249 (backend issue #18) ships
  // GET /messages/conversations/archived, POST .../{id}/archive,
  // POST .../{id}/unarchive — archive state now syncs across devices.
  const { data: archivedApiData, isLoading: archiveIsLoading } = useArchivedConversationsList();
  const archiveMutation = useArchiveMutation();
  const unarchiveMutation = useUnarchiveMutation();
  const { data: rawResolvedEscalations } = useResolvedEscalations();
  const [inboxView, setInboxView] = useState<"active" | "archived">("active");

  const handleArchive = useCallback(
    async (conv: Conversation) => {
      const id = conv.conversationKey || conv.id;
      if (!id) {
        toast.error("Couldn't archive — no stable identifier on this row.");
        return;
      }
      try {
        await archiveMutation.mutateAsync(id);
        setSelectedConv((cur) => (cur?.id === conv.id ? null : cur));
        toast.success("Archived", {
          description: "Returns to Active when the customer replies.",
        });
      } catch {
        toast.error("Couldn't archive — try again.");
      }
    },
    [archiveMutation],
  );
  const handleRestore = useCallback(
    async (conv: Conversation) => {
      const id = conv.conversationKey || conv.id;
      if (!id) return;
      try {
        await unarchiveMutation.mutateAsync(id);
        toast.success("Restored to Active");
      } catch {
        toast.error("Couldn't restore — try again.");
      }
    },
    [unarchiveMutation],
  );

  const { data: apiConversations, isLoading, isError } = useConversations();
  // Escalations list is the source of truth for the Escalations tab AND for
  // the sidebar count. Same normalizer as DashboardShell, so they always
  // agree. (React Query dedups by key, so this is a free read.)
  const {
    data: rawEscalations,
    isLoading: escIsLoading,
    isError: escIsError,
    error: escError,
  } = useEscalations("all");

  // Pre-filter projection of the API list. Used as the source for
  // escalation enrichment so an escalation row whose owning conversation
  // is blocked still resolves its `conversationKey` correctly — without
  // it the row would fall back to `n.phone` and its keys would no longer
  // match the blocked Set (the Set is keyed on whatever the backend
  // stored, which is `conversationKey || id` — see BlockSenderModal).
  // Hidden rows are still excluded from enrichment because a hidden
  // conversation is gone from the operator's world entirely.
  const enrichmentConversations: Conversation[] = useMemo(() => {
    if (isError || !apiConversations) return [];
    return apiConversations
      .map(mapApiConversation)
      .filter((c) => !isRowHidden(collectConversationHideKeys(c)));
  }, [apiConversations, isError, isRowHidden]);

  const allConversations: Conversation[] = useMemo(() => {
    return enrichmentConversations.filter(
      (c) => !isRowBlocked(collectConversationHideKeys(c)),
    );
  }, [enrichmentConversations, isRowBlocked]);

  // Convert the live /escalations response into Conversation-shaped rows the
  // existing MessageRow + ConversationDetailPane already know how to render.
  // When a matching live conversation exists (by phone), enrich the row so it
  // looks identical to its Inbox counterpart. Resolved rows are dropped here
  // so the count and the list always match.
  const escalationRows: Conversation[] = useMemo(() => {
    if (!rawEscalations) return [];
    // Use the PRE-block-filter projection for enrichment so a blocked
    // sender's escalation row still resolves to the correct
    // `conversationKey` (which is what the blocked Set is keyed on).
    // The blocked filter still runs at the end of this pipeline, so
    // the row is dropped from the rendered list — but only after its
    // identifier resolved correctly enough for the filter to match.
    const convoById = new Map(enrichmentConversations.map((c) => [c.id, c]));
    // Normalize + drop resolved + dedupe by stable conversation key so a
    // single customer/conversation never appears as 2-3 rows. Sidebar
    // count uses the identical pass.
    const active = [];
    for (const raw of rawEscalations as unknown[]) {
      const n = normalizeEscalation(raw);
      if (!n || n.resolved) continue;
      active.push(n);
    }
    const deduped = dedupeEscalations(active);
    return deduped
      .map((n) => {
        const enrich = n.phone ? convoById.get(n.phone) ?? null : null;
        return escalationToConversationRow(n, enrich);
      })
      .filter((c) => {
        const keys = collectConversationHideKeys(c);
        return !isRowHidden(keys) && !isRowBlocked(keys);
      });
  }, [rawEscalations, enrichmentConversations, isRowHidden, isRowBlocked]);

  const archivedConversations: Conversation[] = useMemo(() => {
    if (!archivedApiData) return [];
    return archivedApiData
      .map(mapApiConversation)
      .filter((c) => {
        const keys = collectConversationHideKeys(c);
        return !isRowHidden(keys) && !isRowBlocked(keys);
      });
  }, [archivedApiData, isRowHidden, isRowBlocked]);

  const resolvedEscalationRows: Conversation[] = useMemo(() => {
    if (!rawResolvedEscalations) return [];
    // Pre-block-filter source for the same reason as `escalationRows`
    // above — keeps the blocked filter at the end of the pipeline
    // honest for resolved escalation rows whose owning conversation
    // has been blocked since.
    const convoById = new Map(enrichmentConversations.map((c) => [c.id, c]));
    const resolved = [];
    for (const raw of rawResolvedEscalations as unknown[]) {
      const n = normalizeEscalation(raw);
      if (!n) continue;
      resolved.push(n);
    }
    const deduped = dedupeEscalations(resolved);
    return deduped
      .map((n) => {
        const enrich = n.phone ? convoById.get(n.phone) ?? null : null;
        const row = escalationToConversationRow(n, enrich);
        // Embed resolved flag in the data so ConversationDetailPane can enforce
        // read-only/history mode independently of the active UI filter state.
        return { ...row, resolvedEscalation: true as const };
      })
      .filter((c) => {
        const keys = collectConversationHideKeys(c);
        return !isRowHidden(keys) && !isRowBlocked(keys);
      });
  }, [rawResolvedEscalations, enrichmentConversations, isRowHidden, isRowBlocked]);

  // Stable handler. Inbox-context navigation now writes to the URL via
  // `inboxContextUrl(id)` so a refresh / crash-recovery / 401 bounce
  // restores the same view. The URL→activeNav effect above does the
  // actual state update; here we only clear transient UI state
  // (selected conversation + search box) so a channel switch feels
  // like a fresh view.
  const handleNavSelect = useCallback((id: NavId) => {
    const externalRoute = EXTERNAL_ROUTES[id];
    if (externalRoute) {
      navigate(externalRoute);
      return;
    }
    // Inbox / Escalations / channel:*: navigate to the canonical URL.
    const target = inboxContextUrl(id);
    const here = location + (search ? `?${search}` : "");
    if (here !== target) navigate(target);
    setSearchQueryState(() => "");
    setSelectedConv(() => null);
  }, [navigate, location, search]);

  // Deep-link support for the Appointments page (and any future surface
  // that wants to open a specific conversation). Reading `?c=<key>` once
  // the conversation list has loaded so we can resolve the key to a
  // Conversation object the existing detail pane already knows how to
  // render. The query string is then stripped so a refresh doesn't
  // re-trigger the open. Runs only when allConversations becomes
  // populated.
  useEffect(() => {
    if (allConversations.length === 0) return;
    let key: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      key = params.get("c");
    } catch {
      key = null;
    }
    if (!key) return;
    const match = allConversations.find((c) => c.id === key);
    if (match) {
      setSelectedConv(match);
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("c");
        window.history.replaceState({}, "", url.toString());
      } catch {
        // ignore — query strip is best-effort
      }
    }
  }, [allConversations]);

  // ---- Deep-link handling (escalation links from alert emails / WhatsApp) --
  //
  // Two link shapes resolve to Inbox:
  //   - Path:  /escalations/:id            (PRIMARY — what backend sends now)
  //   - Query: /?view=escalations&escalationId=ID  (fallback)
  //
  // When the kind is `appointment` we hand control over to the
  // Appointments page via `navigate(...)`; Inbox doesn't own that
  // surface. We track the consumed id in a ref so that:
  //   - escalation list refetches don't re-trigger the auto-open (which
  //     would fight the user if they had since clicked elsewhere), and
  //   - sidebar / refresh / heartbeat keep working untouched.
  const deepLink = useDeepLink();
  const consumedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (deepLink.kind === "appointment") {
      // Forward query-style appointment links from the inbox surface
      // to the Appointments page, where the highlight logic lives.
      const target = deepLink.id
        ? `/appointments/${encodeURIComponent(deepLink.id)}`
        : "/appointments";
      navigate(target);
      return;
    }
    if (deepLink.kind !== "escalation") return;

    // Tab switch is handled by the URL→activeNav effect above:
    // /escalations and ?view=escalations alone resolve to "escalations"
    // without any explicit setState call here.

    if (!deepLink.id) {
      // No id to resolve — clean up query fallback markers and bail.
      if (deepLink.source === "query") clearDeepLinkQuery();
      return;
    }

    // Wait for escalations to finish loading before declaring not-found.
    if (escIsLoading) return;

    const lookupKey = deepLink.id;
    if (consumedDeepLinkRef.current === lookupKey) return;

    if (escIsError) {
      // Don't claim "not found" when the request itself errored — the
      // existing error UI in the list will surface that, and a refresh
      // can re-fire the deep link cleanly.
      return;
    }

    // Match priority: explicit escalationId, then conversation id (in case
    // the backend ever sends a conversation key), then phone.
    const match =
      escalationRows.find((c) => c.escalationId === lookupKey) ??
      escalationRows.find((c) => c.id === lookupKey) ??
      null;

    if (match) {
      setSelectedConv(match);
      consumedDeepLinkRef.current = lookupKey;
      if (deepLink.source === "query") clearDeepLinkQuery();
    } else if (rawEscalations) {
      // Loaded with a definitive answer and the id isn't in the list.
      // Either it was already resolved, or the link is stale.
      consumedDeepLinkRef.current = lookupKey;
      toast.message("Escalation not found or already resolved.");
      if (deepLink.source === "query") clearDeepLinkQuery();
    }
  }, [
    deepLink.kind,
    deepLink.id,
    deepLink.source,
    escalationRows,
    rawEscalations,
    escIsLoading,
    escIsError,
    navigate,
  ]);

  // Drain any leftover legacy PENDING_NAV_KEY parked by the previous
  // build (sessionStorage entries from before nav became URL-driven).
  // Translates the parked intent into a navigation, then clears the key
  // so the next mount can't re-fire it.
  useEffect(() => {
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(PENDING_NAV_KEY);
      if (pending) sessionStorage.removeItem(PENDING_NAV_KEY);
    } catch {
      pending = null;
    }
    if (!pending) return;
    if (
      pending === "inbox" ||
      pending === "escalations" ||
      pending.startsWith("channel:")
    ) {
      const target = inboxContextUrl(pending as NavId);
      const here = window.location.pathname + window.location.search;
      const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const inner =
        base && here.startsWith(base) ? here.slice(base.length) || "/" : here;
      if (inner !== target) navigate(target);
    }
  }, [navigate]);

  const activeChannel: Channel | null = useMemo(() => {
    if (activeNav.startsWith("channel:")) return activeNav.split(":")[1] as Channel;
    return null;
  }, [activeNav]);

  const sectionTitle = useMemo(() => {
    if (activeChannel) return activeChannel;
    return NAV_LABELS[activeNav] || "Inbox";
  }, [activeNav, activeChannel]);

  const filtered = useMemo(() => {
    let list: Conversation[];
    if (activeNav === "escalations") {
      // Resolved tab uses GET /escalations?status=resolved (Brief 249).
      // Active tabs (All / soft / hard) use the standard /escalations endpoint.
      if (escalationFilter === "resolved") {
        list = resolvedEscalationRows;
      } else {
        list = escalationRows;
        if (escalationFilter === "soft") list = list.filter((c) => c.escalationMode === "soft");
        else if (escalationFilter === "hard") list = list.filter((c) => c.escalationMode === "hard");
      }
    } else {
      // Archive is now server-backed: active list comes from /messages/conversations,
      // archived list from /messages/conversations/archived. No client-side split needed.
      const source = inboxView === "archived" ? archivedConversations : allConversations;
      list = source.filter((c) => isChannelEnabled(c.channel));
      if (activeNav.startsWith("channel:")) {
        const ch = activeNav.split(":")[1] as Channel;
        list = list.filter((c) => c.channel === ch);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          (c.sender ?? "").toLowerCase().includes(q) ||
          (c.subject ?? "").toLowerCase().includes(q) ||
          (c.preview ?? "").toLowerCase().includes(q),
      );
    }
    // Newest first by raw last_message_at (ms). Spread into a fresh array so
    // we never mutate the React Query cached array. Invalid/missing
    // timestamps (timestampMs === 0) naturally land at the bottom.
    return [...list].sort((a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0));
  }, [
    allConversations,
    archivedConversations,
    resolvedEscalationRows,
    escalationRows,
    activeNav,
    searchQuery,
    isChannelEnabled,
    escalationFilter,
    inboxView,
  ]);

  const subtitle: React.ReactNode = (() => {
    if (activeNav === "escalations") {
      if (escIsLoading) return "Loading…";
      if (escIsError) return "Couldn't load escalations";
      if (escalationFilter === "resolved") return "Resolved escalations";
      return "Conversations that need your attention";
    }
    if (isLoading) return "Loading…";
    if (isError) return "Couldn't load";
    if (activeChannel) {
      const n = filtered.length;
      return `${n} ${n === 1 ? "conversation" : "conversations"}`;
    }
    return "All conversations";
  })();

  const titleNode: React.ReactNode = activeChannel ? (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: CHANNEL_BADGE_COLORS[activeChannel] ?? "#9aa0a6" }}
      />
      {sectionTitle}
    </span>
  ) : (
    sectionTitle
  );

  return (
    <DashboardShell
      activeNav={activeNav}
      onNavSelect={handleNavSelect}
      searchQuery={searchQuery}
      onSearchChange={(q) => { setSearchQueryState(q); setSelectedConv(null); }}
      pageTitle={titleNode}
      pageSubtitle={subtitle}
    >
      <div className="flex h-full overflow-hidden">
        {/* Conversation list — hidden on mobile when detail is open */}
        <div
          className={cn(
            "overflow-y-auto",
            selectedConv
              ? "hidden md:flex md:flex-col md:w-[320px] md:flex-none md:border-r md:border-[#f1f3f4]"
              : "flex-1 flex flex-col",
          )}
        >
          {activeNav === "escalations" ? (
            <div
              className="flex items-center gap-1 px-3 py-2 border-b border-[#f1f3f4] bg-white sticky top-0 z-10 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Escalation filter"
            >
              {(["all", "soft", "hard", "resolved"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={escalationFilter === m}
                  onClick={() => { setEscalationFilter(m); setSelectedConv(null); }}
                  className={cn(
                    "px-3 py-1 text-[12px] rounded-full flex-shrink-0",
                    escalationFilter === m
                      ? "bg-[#e8f0fe] text-[#1a73e8] font-medium"
                      : "text-[#5f6368] hover:bg-[#f1f3f4]",
                  )}
                >
                  {m === "all" ? "All" : m === "soft" ? "Agent needs help" : m === "hard" ? "Human takeover" : "Resolved"}
                </button>
              ))}
            </div>
          ) : (
            // Active vs Archived view toggle. Archive is now server-backed
            // (Brief 249 / backend issue #18) — syncs across devices.
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#f1f3f4] bg-white sticky top-0 z-10">
              <div className="flex items-center gap-1">
                {(["active", "archived"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setInboxView(v); setSelectedConv(null); }}
                    className={cn(
                      "px-3 py-1 text-[12px] rounded-full inline-flex items-center gap-1.5",
                      inboxView === v
                        ? "bg-[#e8f0fe] text-[#1a73e8] font-medium"
                        : "text-[#5f6368] hover:bg-[#f1f3f4]",
                    )}
                    aria-pressed={inboxView === v}
                  >
                    {v === "archived" && <Archive className="h-3 w-3" />}
                    {v === "active" ? "Active" : "Archived"}
                  </button>
                ))}
              </div>
              {inboxView === "archived" && archiveIsLoading && (
                <span className="text-[10.5px] text-[#9aa0a6] truncate">Loading…</span>
              )}
            </div>
          )}
          {(activeNav === "escalations" ? escIsLoading : inboxView === "archived" ? archiveIsLoading : isLoading) && filtered.length === 0 ? (
            <div className="divide-y divide-[#f1f3f4]" aria-busy="true" aria-label="Loading conversations">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-4">
                  <div className="h-9 w-9 flex-shrink-0 animate-pulse rounded-full bg-[#f1f3f4]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 animate-pulse rounded bg-[#f1f3f4]" />
                    <div className="h-3 w-3/4 animate-pulse rounded bg-[#f1f3f4]" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length > 0 ? (
            filtered.map((conv) => (
              <MessageRow
                key={conv.id}
                conversation={conv}
                isSelected={selectedConv?.id === conv.id}
                hideChannel={Boolean(activeChannel)}
                onSelect={setSelectedConv}
                onReply={canDeleteChannel(conv.channel) ? handleEmailReply : undefined}
                onForward={canDeleteChannel(conv.channel) ? handleEmailForward : undefined}
                onDelete={canDeleteChannel(conv.channel) ? handleEmailDelete : undefined}
                onArchive={escalationFilter === "resolved" ? undefined : handleArchive}
                onRestore={escalationFilter === "resolved" ? undefined : handleRestore}
                archived={inboxView === "archived"}
                dimmed={escalationFilter === "resolved"}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <p className="text-[14px] text-[#5f6368]">
                {activeNav === "escalations"
                  ? escIsError
                    ? `Couldn't load escalations${
                        escError instanceof Error && escError.message
                          ? `: ${escError.message}`
                          : "."
                      }`
                    : escalationFilter === "resolved"
                      ? "No resolved escalations yet."
                      : "No escalations to show."
                  : isError
                    ? "Couldn't load conversations."
                    : "No conversations to show."}
              </p>
            </div>
          )}
        </div>

        {/* Detail pane */}
        {selectedConv && (
          <ConversationDetailPane
            conversation={selectedConv}
            onClose={() => setSelectedConv(null)}
            onEmailReply={canDeleteChannel(selectedConv.channel) ? handleEmailReply : undefined}
            onEmailForward={canDeleteChannel(selectedConv.channel) ? handleEmailForward : undefined}
            onEmailDelete={canDeleteChannel(selectedConv.channel) ? handleEmailDelete : undefined}
            onArchive={escalationFilter === "resolved" ? undefined : handleArchive}
            onRestore={escalationFilter === "resolved" ? undefined : handleRestore}
            archived={inboxView === "archived"}
            onBlock={
              escalationFilter === "resolved" || inboxView === "archived"
                ? undefined
                : handleBlock
            }
            resolvedContext={escalationFilter === "resolved"}
          />
        )}
      </div>

      {/* Email action modals — mounted at the page level so they overlay
          both the list and the detail pane on every viewport. */}
      <EmailReplyModal
        open={Boolean(emailReplyConv)}
        conversation={emailReplyConv}
        onClose={() => setEmailReplyConv(null)}
      />
      <EmailForwardModal
        open={Boolean(emailForwardConv)}
        conversation={emailForwardConv}
        onClose={() => setEmailForwardConv(null)}
      />
      <EmailDeleteConfirm
        open={Boolean(emailDeleteConv)}
        conversation={emailDeleteConv}
        onClose={() => setEmailDeleteConv(null)}
        onDeleted={handleEmailDeleted}
      />
      <BlockSenderModal
        open={Boolean(blockConv)}
        conversation={blockConv}
        operatorLabel="Operator"
        onClose={() => setBlockConv(null)}
        onBlocked={handleBlocked}
      />
    </DashboardShell>
  );
}
