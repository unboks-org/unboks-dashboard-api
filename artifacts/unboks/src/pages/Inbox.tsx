import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { DashboardShell, PENDING_NAV_KEY } from "@/components/inbox/DashboardShell";
import { MessageRow } from "@/components/inbox/MessageRow";
import type { Channel, Conversation } from "@/data/conversations";
import {
  useConversations,
  useConversation,
  useEscalations,
  useEscalationMutations,
} from "@/hooks/use-client-api";
import { mapApiConversation } from "@/lib/conversation-mapper";
import { CHANNEL_BADGE_COLORS } from "@/lib/channel-map";
import type { NavId } from "@/components/inbox/Drawer";
import { useEnabledChannels } from "@/hooks/use-enabled-channels";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  X,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  VolumeX,
} from "lucide-react";
import type { ApiMessage, ConversationDetail } from "@/lib/api";

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
  const isAssistant = msg.role === "assistant";
  return (
    <div className={cn("flex", isAssistant ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed",
          isAssistant
            ? "bg-[#e8f0fe] text-[#1a73e8] rounded-br-sm"
            : "bg-[#f1f3f4] text-[#202124] rounded-bl-sm",
        )}
      >
        {msg.content}
        {msg.timestamp && (
          <p className="text-[11px] mt-1 opacity-60">{msg.timestamp}</p>
        )}
      </div>
    </div>
  );
}

/** AI rewrite stub button — disabled, "coming soon" tooltip. No external API. */
function AiRewriteButton({ disabled }: { disabled: boolean }) {
  return (
    <button
      type="button"
      disabled
      title={disabled ? "Write a reply first." : "AI rewrite coming soon"}
      aria-label="Make professional"
      className="absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-[#9aa0a6] bg-white/80 border border-[#e8eaed] cursor-not-allowed"
    >
      <Sparkles className="w-3.5 h-3.5" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Escalation banner + action panels
// ---------------------------------------------------------------------------

function EscalationBanner({ detail }: { detail: ConversationDetail }) {
  if (!detail.escalated || detail.escalationResolved) return null;
  const mode = detail.escalationMode;
  if (mode === "soft") {
    return (
      <div className="bg-[#fef7e0] border-b border-[#feefc3] px-4 py-2.5 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-[#a06800] flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#a06800]">AI needs help</p>
          <p className="text-[12px] text-[#5f4400]">AI is waiting for your guidance before it replies.</p>
          {detail.escalationSummary && (
            <p className="text-[12px] text-[#5f4400] mt-1 italic">{detail.escalationSummary}</p>
          )}
        </div>
      </div>
    );
  }
  if (mode === "hard") {
    return (
      <div className="bg-[#fce8e6] border-b border-[#f6c6c2] px-4 py-2.5 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-[#c5221f] flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#c5221f]">Human takeover</p>
          <p className="text-[12px] text-[#7a1c1a]">AI has handed this conversation to you. Reply directly to the customer.</p>
          {detail.escalationSummary && (
            <p className="text-[12px] text-[#7a1c1a] mt-1 italic">{detail.escalationSummary}</p>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="bg-[#f1f3f4] border-b border-[#e8eaed] px-4 py-2.5 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-[#5f6368] flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[#202124]">Escalation</p>
        <p className="text-[12px] text-[#5f6368]">This conversation needs attention.</p>
      </div>
    </div>
  );
}

function SoftActionPanel({
  conversationDbId,
  onDone,
}: {
  conversationDbId: string;
  onDone: () => void;
}) {
  const [guidance, setGuidance] = useState("");
  const [saveToYourInfo, setSaveToYourInfo] = useState(false);
  const [autoUseNextTime, setAutoUseNextTime] = useState(false);
  const { guidance: guidanceMut, takeover, resolve } = useEscalationMutations();
  const empty = guidance.trim().length === 0;

  const onGuide = () => {
    if (empty) return;
    guidanceMut.mutate(
      {
        id: conversationDbId,
        payload: { guidance: guidance.trim(), saveToYourInfo, autoUseNextTime },
      },
      {
        onSuccess: () => {
          setGuidance("");
          setSaveToYourInfo(false);
          setAutoUseNextTime(false);
          onDone();
        },
      },
    );
  };

  return (
    <div className="border-t border-[#e8eaed] bg-white px-4 py-3 space-y-2.5 flex-shrink-0">
      <p className="text-[11px] text-[#5f6368]">This is guidance for the AI, not a customer message.</p>
      <div className="relative">
        <textarea
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          placeholder="Type guidance for the AI"
          rows={3}
          className="w-full text-[13px] text-[#202124] border border-[#dadce0] rounded-md px-3 py-2 pr-10 outline-none focus:border-[#1a73e8] resize-none"
        />
        <AiRewriteButton disabled={empty} />
      </div>
      <label className="flex items-center gap-2 text-[12px] text-[#202124] cursor-pointer">
        <input
          type="checkbox"
          checked={saveToYourInfo}
          onChange={(e) => setSaveToYourInfo(e.target.checked)}
          className="w-3.5 h-3.5"
        />
        Save this answer to Your Info for next time
      </label>
      <label className={cn(
        "flex items-center gap-2 text-[12px] cursor-pointer",
        saveToYourInfo ? "text-[#202124]" : "text-[#9aa0a6]",
      )}>
        <input
          type="checkbox"
          checked={autoUseNextTime}
          disabled={!saveToYourInfo}
          onChange={(e) => setAutoUseNextTime(e.target.checked)}
          className="w-3.5 h-3.5"
        />
        Let AI use this answer automatically next time
      </label>
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <button
          type="button"
          onClick={onGuide}
          disabled={empty || guidanceMut.isPending}
          className="px-3 py-1.5 text-[13px] font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1765cc] disabled:bg-[#dadce0] disabled:cursor-not-allowed"
        >
          {guidanceMut.isPending ? "Saving…" : "Guide AI"}
        </button>
        <button
          type="button"
          onClick={() => resolve.mutate({ id: conversationDbId, payload: {} }, { onSuccess: onDone })}
          disabled={resolve.isPending}
          className="px-3 py-1.5 text-[13px] text-[#5f6368] hover:bg-[#f1f3f4] rounded-md"
        >
          Mark resolved
        </button>
        <button
          type="button"
          onClick={() => takeover.mutate({ id: conversationDbId }, { onSuccess: onDone })}
          disabled={takeover.isPending}
          className="ml-auto text-[12px] text-[#c5221f] hover:underline"
        >
          Switch to human takeover
        </button>
      </div>
    </div>
  );
}

function HardActionPanel({
  conversationDbId,
  aiMuted,
  onDone,
}: {
  conversationDbId: string;
  aiMuted: boolean;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [saveAsLearning, setSaveAsLearning] = useState(false);
  const { resolve, takeover, handback } = useEscalationMutations();
  const empty = draft.trim().length === 0;

  const onMarkResolved = () => {
    resolve.mutate(
      {
        id: conversationDbId,
        payload: {
          resolutionNote: draft.trim() || undefined,
          saveAsLearning: saveAsLearning && draft.trim().length > 0,
        },
      },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="border-t border-[#e8eaed] bg-white px-4 py-3 space-y-2.5 flex-shrink-0">
      {/* Placeholder reply action — Phase 1: records state only, does NOT send. */}
      <div className="rounded-md bg-[#fce8e6] border border-[#f6c6c2] p-3 space-y-1.5">
        <p className="text-[13px] font-semibold text-[#c5221f]">Reply</p>
        <p className="text-[12px] text-[#7a1c1a]">
          Direct channel reply will be connected by Jr. For now, this records the human takeover state.
        </p>
      </div>

      {aiMuted && (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#f1f3f4] text-[11px] text-[#5f6368]">
          <VolumeX className="w-3 h-3" />
          AI is muted on this conversation.
        </div>
      )}

      <p className="text-[11px] text-[#5f6368] pt-1">Resolution note (optional — for your records, not sent to the customer).</p>
      <div className="relative">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a resolution note"
          rows={3}
          className="w-full text-[13px] text-[#202124] border border-[#dadce0] rounded-md px-3 py-2 pr-10 outline-none focus:border-[#1a73e8] resize-none"
        />
        <AiRewriteButton disabled={empty} />
      </div>

      <label className={cn(
        "flex items-center gap-2 text-[12px] cursor-pointer",
        empty ? "text-[#9aa0a6]" : "text-[#202124]",
      )}>
        <input
          type="checkbox"
          checked={saveAsLearning}
          disabled={empty}
          onChange={(e) => setSaveAsLearning(e.target.checked)}
          className="w-3.5 h-3.5"
        />
        Save resolution as learning
      </label>

      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <button
          type="button"
          onClick={() => takeover.mutate({ id: conversationDbId })}
          disabled={takeover.isPending || aiMuted}
          className="px-3 py-1.5 text-[13px] font-medium text-white bg-[#c5221f] rounded-md hover:bg-[#a50e0e] disabled:bg-[#dadce0] disabled:cursor-not-allowed"
        >
          {takeover.isPending ? "Saving…" : "Take over conversation"}
        </button>
        <button
          type="button"
          onClick={onMarkResolved}
          disabled={resolve.isPending}
          className="px-3 py-1.5 text-[13px] font-medium text-[#202124] bg-white border border-[#dadce0] rounded-md hover:bg-[#f6f8fc]"
        >
          {resolve.isPending ? "Saving…" : "Mark resolved"}
        </button>
        <button
          type="button"
          onClick={() => handback.mutate({ id: conversationDbId }, { onSuccess: onDone })}
          disabled={handback.isPending}
          className="ml-auto text-[12px] text-[#1a73e8] hover:underline"
        >
          Hand back to AI
        </button>
      </div>
    </div>
  );
}

function LegacyActionPanel({
  conversationDbId,
  onDone,
}: {
  conversationDbId: string;
  onDone: () => void;
}) {
  const { setMode, resolve } = useEscalationMutations();
  return (
    <div className="border-t border-[#e8eaed] bg-white px-4 py-3 space-y-2 flex-shrink-0">
      <p className="text-[12px] text-[#5f6368]">Choose how you want to handle this escalation.</p>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setMode.mutate({ id: conversationDbId, mode: "soft" }, { onSuccess: onDone })}
          className="px-3 py-1.5 text-[13px] font-medium text-[#202124] bg-[#fef7e0] border border-[#feefc3] rounded-md hover:bg-[#fdecb3]"
        >
          AI needs help
        </button>
        <button
          type="button"
          onClick={() => setMode.mutate({ id: conversationDbId, mode: "hard" }, { onSuccess: onDone })}
          className="px-3 py-1.5 text-[13px] font-medium text-[#c5221f] bg-[#fce8e6] border border-[#f6c6c2] rounded-md hover:bg-[#f9d3cf]"
        >
          Human takeover
        </button>
        <button
          type="button"
          onClick={() => resolve.mutate({ id: conversationDbId, payload: {} }, { onSuccess: onDone })}
          className="ml-auto text-[12px] text-[#5f6368] hover:underline"
        >
          Mark resolved
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversation detail pane
// ---------------------------------------------------------------------------

interface ConversationDetailPaneProps {
  conversation: Conversation;
  onClose: () => void;
}

function ConversationDetailPane({ conversation, onClose }: ConversationDetailPaneProps) {
  const { data: detail, isLoading, isError } = useConversation(conversation.id);
  const badgeColor = CHANNEL_BADGE_COLORS[conversation.channel] ?? "#9aa0a6";
  const messages: ApiMessage[] = detail?.messages ?? [];
  // Escalation routes use the conversation DB id. Look it up from the
  // escalations list (cached query) by matching the phone (external_id).
  const { data: escalations } = useEscalations("all");
  const dbId = escalations?.find((e) => e.phone === conversation.id)?.id ?? null;

  const showBanner = detail?.escalated && !detail?.escalationResolved;
  const mode = detail?.escalationMode ?? null;

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden border-l border-[#f1f3f4]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#f1f3f4] flex-shrink-0">
        <button
          onClick={onClose}
          aria-label="Close conversation"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f6f8fc] text-[#5f6368] md:hidden"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          aria-label="Close conversation"
          className="hidden md:flex w-8 h-8 items-center justify-center rounded-full hover:bg-[#f6f8fc] text-[#5f6368]"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#202124] truncate">{conversation.sender}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: badgeColor }}
            >
              {conversation.channel}
            </span>
            {conversation.timestamp && (
              <span className="text-[11px] text-[#9aa0a6]">{conversation.timestamp}</span>
            )}
          </div>
        </div>
      </div>

      {detail && <EscalationBanner detail={detail} />}

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isLoading && (
          <p className="text-[13px] text-[#5f6368] text-center py-8">Loading messages…</p>
        )}

        {!isLoading && messages.length > 0 && (
          messages.map((msg, i) => <MessageBubble key={msg.id ?? i} msg={msg} />)
        )}

        {!isLoading && messages.length === 0 && (
          <div className="py-8 text-center space-y-2">
            {conversation.subject !== "No preview available" && (
              <div className="bg-[#f1f3f4] rounded-2xl rounded-bl-sm px-4 py-2.5 text-[13px] text-[#202124] text-left max-w-[75%]">
                <p className="font-medium">{conversation.subject}</p>
                {conversation.preview && conversation.preview !== conversation.subject && (
                  <p className="text-[#5f6368] mt-1">{conversation.preview}</p>
                )}
              </div>
            )}
            {isError && (
              <p className="text-[12px] text-[#9aa0a6] mt-4">Full conversation history unavailable.</p>
            )}
            {!isError && conversation.subject === "No preview available" && (
              <p className="text-[13px] text-[#9aa0a6]">No messages to display.</p>
            )}
          </div>
        )}
      </div>

      {showBanner && dbId && mode === "soft" && (
        <SoftActionPanel conversationDbId={dbId} onDone={onClose} />
      )}
      {showBanner && dbId && mode === "hard" && (
        <HardActionPanel
          conversationDbId={dbId}
          aiMuted={detail?.aiMuted ?? false}
          onDone={onClose}
        />
      )}
      {showBanner && dbId && mode === null && (
        <LegacyActionPanel conversationDbId={dbId} onDone={onClose} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inbox page
// ---------------------------------------------------------------------------

export default function Inbox() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQueryState] = useState("");
  const [activeNav, setActiveNavState] = useState<NavId>("inbox");
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [escalationFilter, setEscalationFilter] = useState<"all" | "soft" | "hard">("all");
  const { isChannelEnabled } = useEnabledChannels();

  const { data: apiConversations, isLoading, isError } = useConversations();

  const allConversations: Conversation[] = useMemo(() => {
    if (isError || !apiConversations) return [];
    return apiConversations.map(mapApiConversation);
  }, [apiConversations, isError]);

  // Stable handler. Always updates local filter state for inbox-context ids,
  // even when the route is already "/" (channel ↔ channel switches, or
  // re-clicking the same channel). Functional setters avoid any reliance on
  // a stale closure value.
  const handleNavSelect = useCallback((id: NavId) => {
    const externalRoute = EXTERNAL_ROUTES[id];
    if (externalRoute) {
      navigate(externalRoute);
      return;
    }
    // Inbox / Escalations / channel:* — always reset local state.
    setActiveNavState(() => id);
    setSearchQueryState(() => "");
    setSelectedConv(() => null);
  }, [navigate]);

  // Consume any cross-route nav intent parked by DashboardShell when the user
  // clicked a channel/escalations item from Bookings/Analytics/Settings.
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
      setActiveNavState(() => pending as NavId);
      setSearchQueryState(() => "");
      setSelectedConv(() => null);
    }
  }, []);

  const activeChannel: Channel | null = useMemo(() => {
    if (activeNav.startsWith("channel:")) return activeNav.split(":")[1] as Channel;
    return null;
  }, [activeNav]);

  const sectionTitle = useMemo(() => {
    if (activeChannel) return activeChannel;
    return NAV_LABELS[activeNav] || "Inbox";
  }, [activeNav, activeChannel]);

  const filtered = useMemo(() => {
    let list = allConversations.filter((c) => isChannelEnabled(c.channel));
    if (activeNav === "escalations") {
      list = list.filter((c) => c.escalated);
      if (escalationFilter === "soft") list = list.filter((c) => c.escalationMode === "soft");
      else if (escalationFilter === "hard") list = list.filter((c) => c.escalationMode === "hard");
    } else if (activeNav.startsWith("channel:")) {
      const ch = activeNav.split(":")[1] as Channel;
      list = list.filter((c) => c.channel === ch);
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
    return list;
  }, [allConversations, activeNav, searchQuery, isChannelEnabled, escalationFilter]);

  const subtitle: React.ReactNode = (() => {
    if (isLoading) return "Loading…";
    if (isError) return "Couldn't load";
    if (activeNav === "escalations") {
      const n = filtered.length;
      return `${n} ${n === 1 ? "escalation" : "escalations"}`;
    }
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
            <div className="flex items-center gap-1 px-3 py-2 border-b border-[#f1f3f4] bg-white sticky top-0 z-10">
              {(["all", "soft", "hard"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setEscalationFilter(m)}
                  className={cn(
                    "px-3 py-1 text-[12px] rounded-full",
                    escalationFilter === m
                      ? "bg-[#e8f0fe] text-[#1a73e8] font-medium"
                      : "text-[#5f6368] hover:bg-[#f1f3f4]",
                  )}
                >
                  {m === "all" ? "All" : m === "soft" ? "AI needs help" : "Human takeover"}
                </button>
              ))}
            </div>
          ) : null}
          {isLoading && filtered.length === 0 ? (
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
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <p className="text-[14px] text-[#5f6368]">
                {isError ? "Couldn't load conversations." : "No conversations to show."}
              </p>
            </div>
          )}
        </div>

        {/* Detail pane */}
        {selectedConv && (
          <ConversationDetailPane
            conversation={selectedConv}
            onClose={() => setSelectedConv(null)}
          />
        )}
      </div>
    </DashboardShell>
  );
}
