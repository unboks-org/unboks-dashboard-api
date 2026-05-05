import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { MessageRow } from "@/components/inbox/MessageRow";
import type { Channel, Conversation } from "@/data/conversations";
import {
  useConversations,
  useConversation,
  useEscalations,
  useEscalationMutations,
} from "@/hooks/use-client-api";
import { mapApiConversation } from "@/lib/conversation-mapper";
import type { NavId } from "@/components/inbox/Drawer";
import { useEnabledChannels } from "@/hooks/use-enabled-channels";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  X,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Reply as ReplyIcon,
  Copy as CopyIcon,
  ExternalLink,
} from "lucide-react";
import type { ApiMessage, ConversationDetail } from "@/lib/api";

const PAGE_ROUTES: Partial<Record<NavId, string>> = {
  bookings: "/bookings",
  settings: "/settings",
  analytics: "/analytics",
};

const NAV_LABELS: Record<string, string> = {
  inbox: "Inbox",
  escalations: "Escalations",
};

const CHANNEL_BADGE_COLORS: Record<string, string> = {
  WhatsApp: "#25d366",
  Email: "#1a73e8",
  Instagram: "#c13584",
  Facebook: "#1877f2",
  X: "#202124",
  TikTok: "#010101",
  Messenger: "#0084ff",
  Unknown: "#9aa0a6",
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
// Hard escalation reply helpers — open external channel, no outbound API.
// ---------------------------------------------------------------------------

function buildReplyDeepLink(
  channel: Channel,
  contact: string | null | undefined,
  draft: string,
): string | null {
  const safeDraft = draft ? encodeURIComponent(draft) : "";
  if (!contact) return null;
  const trimmed = contact.trim();
  if (!trimmed) return null;
  if (channel === "Email") {
    if (!/.+@.+\..+/.test(trimmed)) return null;
    const subject = encodeURIComponent("Re: your message");
    return `mailto:${encodeURIComponent(trimmed)}?subject=${subject}${safeDraft ? `&body=${safeDraft}` : ""}`;
  }
  if (channel === "WhatsApp") {
    const digits = trimmed.replace(/[^\d]/g, "");
    if (!digits) return null;
    return `https://wa.me/${digits}${safeDraft ? `?text=${safeDraft}` : ""}`;
  }
  return null;
}

function ReplyExternalPanel({
  channel,
  contact,
  draft,
}: {
  channel: Channel;
  contact: string | null | undefined;
  draft: string;
}) {
  const link = buildReplyDeepLink(channel, contact, draft);
  const [copied, setCopied] = useState<"none" | "draft" | "contact">("none");

  const onCopy = async (kind: "draft" | "contact", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied("none"), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-2 rounded-md bg-[#f8f9fa] border border-[#e8eaed] p-3">
      <p className="text-[13px] font-medium text-[#202124]">Reply in the connected channel.</p>
      <div className="flex items-center gap-2 text-[12px] text-[#5f6368]">
        <span className="font-medium">Customer:</span>
        <span className="truncate">{contact || "Unknown"}</span>
        {contact && (
          <button
            type="button"
            onClick={() => onCopy("contact", contact)}
            className="ml-auto inline-flex items-center gap-1 text-[#1a73e8] hover:underline"
          >
            <CopyIcon className="w-3 h-3" />
            {copied === "contact" ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1a73e8] hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open {channel}
        </a>
      ) : (
        <p className="text-[12px] text-[#5f6368]">
          No direct link available — copy the customer contact and reply in {channel}.
        </p>
      )}
      {draft && (
        <button
          type="button"
          onClick={() => onCopy("draft", draft)}
          className="inline-flex items-center gap-1 text-[12px] text-[#1a73e8] hover:underline"
        >
          <CopyIcon className="w-3 h-3" />
          {copied === "draft" ? "Draft copied" : "Copy draft"}
        </button>
      )}
    </div>
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
        <p className="text-[12px] text-[#5f6368]">Choose how you want to handle this.</p>
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
  channel,
  contact,
  onDone,
}: {
  conversationDbId: string;
  channel: Channel;
  contact: string | null | undefined;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [saveAsLearning, setSaveAsLearning] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const { resolve, setMode } = useEscalationMutations();
  const empty = draft.trim().length === 0;
  const link = buildReplyDeepLink(channel, contact, draft);

  const onReplyClick = () => {
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    } else {
      setShowFallback(true);
    }
  };

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
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReplyClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white bg-[#c5221f] rounded-md hover:bg-[#a50e0e]"
        >
          <ReplyIcon className="w-3.5 h-3.5" />
          Reply
        </button>
        <span className="text-[11px] text-[#5f6368]">Opens {channel} — replies are sent there, not from the dashboard.</span>
      </div>

      {showFallback && (
        <ReplyExternalPanel channel={channel} contact={contact} draft={draft.trim()} />
      )}

      <p className="text-[11px] text-[#5f6368] pt-1">Resolution note (optional — for your records, not sent to the customer).</p>
      <div className="relative">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a resolution note or draft reply"
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
          onClick={onMarkResolved}
          disabled={resolve.isPending}
          className="px-3 py-1.5 text-[13px] font-medium text-[#202124] bg-white border border-[#dadce0] rounded-md hover:bg-[#f6f8fc]"
        >
          {resolve.isPending ? "Saving…" : "Mark resolved"}
        </button>
        <button
          type="button"
          onClick={() => setMode.mutate({ id: conversationDbId, mode: "soft" }, { onSuccess: onDone })}
          disabled={setMode.isPending}
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
          channel={conversation.channel}
          contact={detail?.contactId ?? conversation.id}
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

  const handleNavSelect = (id: NavId) => {
    const route = PAGE_ROUTES[id];
    if (route) { navigate(route); return; }
    setActiveNavState(id);
    setSearchQueryState("");
    setSelectedConv(null);
  };

  const sectionTitle = useMemo(() => {
    if (activeNav.startsWith("channel:")) return activeNav.split(":")[1];
    return NAV_LABELS[activeNav] || "Inbox";
  }, [activeNav]);

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

  return (
    <DashboardShell
      activeNav={activeNav}
      onNavSelect={handleNavSelect}
      searchQuery={searchQuery}
      onSearchChange={(q) => { setSearchQueryState(q); setSelectedConv(null); }}
      pageTitle={sectionTitle}
      titleSuffix={
        isLoading ? <span className="text-[12px] text-[#1a73e8]">Loading…</span>
          : isError ? <span className="text-[12px] text-[#d93025]">(preview mode)</span>
          : null
      }
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
          {activeNav === "escalations" && (
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
          )}
          {filtered.length > 0 ? (
            filtered.map((conv) => (
              <MessageRow
                key={conv.id}
                conversation={conv}
                isSelected={selectedConv?.id === conv.id}
                onSelect={setSelectedConv}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <p className="text-[14px] text-[#5f6368]">No conversations to show.</p>
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
