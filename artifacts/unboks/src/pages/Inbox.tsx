import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { MessageRow } from "@/components/inbox/MessageRow";
import { conversations as MOCK_CONVERSATIONS, Channel } from "@/data/conversations";
import type { Conversation } from "@/data/conversations";
import { useConversations, useConversation } from "@/hooks/use-client-api";
import { mapApiConversation } from "@/lib/conversation-mapper";
import type { NavId } from "@/components/inbox/Drawer";
import { useEnabledChannels } from "@/hooks/use-enabled-channels";
import { cn } from "@/lib/utils";
import { ArrowLeft, X, AlertCircle } from "lucide-react";
import type { ApiMessage } from "@/lib/api";

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
// Conversation detail pane
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

interface ConversationDetailPaneProps {
  conversation: Conversation;
  onClose: () => void;
}

function ConversationDetailPane({ conversation, onClose }: ConversationDetailPaneProps) {
  const { data: detail, isLoading, isError } = useConversation(conversation.id);
  const badgeColor = CHANNEL_BADGE_COLORS[conversation.channel] ?? "#9aa0a6";
  const messages: ApiMessage[] = detail?.messages ?? [];

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
            {conversation.escalated && (
              <span className="flex items-center gap-1 text-[11px] text-[#d93025]">
                <AlertCircle className="w-3 h-3" />
                Escalated
              </span>
            )}
            {conversation.timestamp && (
              <span className="text-[11px] text-[#9aa0a6]">{conversation.timestamp}</span>
            )}
          </div>
        </div>
      </div>

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
  const { isChannelEnabled } = useEnabledChannels();

  const { data: apiConversations, isLoading, isError } = useConversations();

  const allConversations: Conversation[] = useMemo(() => {
    if (isError || !apiConversations) return MOCK_CONVERSATIONS;
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
  }, [allConversations, activeNav, searchQuery, isChannelEnabled]);

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
              : "flex-1",
          )}
        >
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
