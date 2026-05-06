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
  useDeleteConversation,
} from "@/hooks/use-client-api";
import {
  mapApiConversation,
  normalizeEscalation,
  escalationToConversationRow,
} from "@/lib/conversation-mapper";
import { CHANNEL_BADGE_COLORS } from "@/lib/channel-map";
import type { NavId } from "@/components/inbox/Drawer";
import { useEnabledChannels } from "@/hooks/use-enabled-channels";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  X,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import type { ApiMessage, ConversationDetail } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { EscalationReplyComposer } from "@/components/inbox/EscalationReplyComposer";

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

// ---------------------------------------------------------------------------
// Escalation banner + action panels
// ---------------------------------------------------------------------------
//
// Soft + Hard composers live in EscalationReplyComposer. LegacyActionPanel is
// kept for the rare case where an escalation has no mode set yet (legacy DB
// rows) and the operator needs to pick soft/hard before composing.

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
  const { data: detail, isLoading, isError, error } = useConversation(conversation.id);
  const badgeColor = CHANNEL_BADGE_COLORS[conversation.channel] ?? "#9aa0a6";
  const messages: ApiMessage[] = detail?.messages ?? [];
  // Surface the underlying API status/message so an email conversation that
  // 404s (or whose id breaks server-side routing) doesn't render as a blank
  // pane. ApiError carries the HTTP status; fall back to its message string.
  const errorDetail: { status: number | null; message: string } | null = isError
    ? error instanceof ApiError
      ? { status: error.status, message: error.message }
      : { status: null, message: error instanceof Error ? error.message : "Unknown error" }
    : null;
  // Escalation routes use the conversation DB id. Look it up from the
  // escalations list (cached query) via the same normalizer as the list and
  // the sidebar count, so snake_case shapes (`external_id`, etc.) resolve to
  // the same `dbId` as `conversation.id` (which is the normalized phone).
  const { data: escalations } = useEscalations("all");
  const dbId = useMemo(() => {
    if (!escalations) return null;
    for (const raw of escalations as unknown[]) {
      const n = normalizeEscalation(raw);
      if (n && !n.resolved && n.phone && n.phone === conversation.id) return n.id;
    }
    return null;
  }, [escalations, conversation.id]);

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
          <div className="py-8 space-y-3">
            {conversation.subject !== "No preview available" && (
              <div className="bg-[#f1f3f4] rounded-2xl rounded-bl-sm px-4 py-2.5 text-[13px] text-[#202124] text-left max-w-[75%]">
                <p className="font-medium">{conversation.subject}</p>
                {conversation.preview && conversation.preview !== conversation.subject && (
                  <p className="text-[#5f6368] mt-1">{conversation.preview}</p>
                )}
              </div>
            )}

            {/* Calm, prominent error block. Replaces the previous tiny grey
                line that read as "blank pane" when an Email conversation
                detail failed to load. Shows status + reason so users know it
                isn't a hung loader. */}
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

      {showBanner && dbId && mode === "soft" && (
        <EscalationReplyComposer
          conversationDbId={dbId}
          conversationId={conversation.id}
          mode="soft"
          channel={conversation.channel}
          onDone={onClose}
        />
      )}
      {showBanner && dbId && mode === "hard" && (
        <EscalationReplyComposer
          conversationDbId={dbId}
          conversationId={conversation.id}
          mode="hard"
          channel={conversation.channel}
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
  const deleteConv = useDeleteConversation();

  // Email-only persistent row actions. Reply opens the conversation detail
  // (where the existing reply UI lives). Forward has no backend yet — show
  // calm placeholder copy. Delete confirms first, then calls the existing
  // DELETE /messages/conversations/:id endpoint.
  const handleEmailReply = useCallback((conv: Conversation) => {
    setSelectedConv(conv);
  }, []);
  const handleEmailForward = useCallback((_conv: Conversation) => {
    window.alert("Forward will be connected by the Unboks team.");
  }, []);
  const handleEmailDelete = useCallback(
    (conv: Conversation) => {
      const subject = conv.subject?.trim() || conv.sender || "this email";
      const ok = window.confirm(`Delete "${subject}"? This can't be undone.`);
      if (!ok) return;
      deleteConv.mutate(conv.id, {
        onSuccess: () => {
          setSelectedConv((cur) => (cur?.id === conv.id ? null : cur));
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : "Unknown error";
          window.alert(
            `Couldn't delete: ${msg}\n\nIf this keeps happening, delete will be connected by the Unboks team.`,
          );
        },
      });
    },
    [deleteConv],
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

  const allConversations: Conversation[] = useMemo(() => {
    if (isError || !apiConversations) return [];
    return apiConversations.map(mapApiConversation);
  }, [apiConversations, isError]);

  // Convert the live /escalations response into Conversation-shaped rows the
  // existing MessageRow + ConversationDetailPane already know how to render.
  // When a matching live conversation exists (by phone), enrich the row so it
  // looks identical to its Inbox counterpart. Resolved rows are dropped here
  // so the count and the list always match.
  const escalationRows: Conversation[] = useMemo(() => {
    if (!rawEscalations) return [];
    const convoById = new Map(allConversations.map((c) => [c.id, c]));
    const out: Conversation[] = [];
    for (const raw of rawEscalations as unknown[]) {
      const n = normalizeEscalation(raw);
      if (!n || n.resolved) continue;
      const enrich = n.phone ? convoById.get(n.phone) ?? null : null;
      out.push(escalationToConversationRow(n, enrich));
    }
    return out;
  }, [rawEscalations, allConversations]);

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
    let list: Conversation[];
    if (activeNav === "escalations") {
      // Escalations come from /escalations, NOT from /messages/conversations.
      // Don't apply per-channel visibility here — an escalation must always
      // be reachable, even if its channel toggle happens to be off.
      // "All" tab includes legacy/null modes by design.
      list = escalationRows;
      if (escalationFilter === "soft") list = list.filter((c) => c.escalationMode === "soft");
      else if (escalationFilter === "hard") list = list.filter((c) => c.escalationMode === "hard");
    } else {
      list = allConversations.filter((c) => isChannelEnabled(c.channel));
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
  }, [allConversations, escalationRows, activeNav, searchQuery, isChannelEnabled, escalationFilter]);

  const subtitle: React.ReactNode = (() => {
    if (activeNav === "escalations") {
      if (escIsLoading) return "Loading…";
      if (escIsError) return "Couldn't load escalations";
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
          {(activeNav === "escalations" ? escIsLoading : isLoading) && filtered.length === 0 ? (
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
                onReply={conv.channel === "Email" ? handleEmailReply : undefined}
                onForward={conv.channel === "Email" ? handleEmailForward : undefined}
                onDelete={conv.channel === "Email" ? handleEmailDelete : undefined}
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
          />
        )}
      </div>
    </DashboardShell>
  );
}
