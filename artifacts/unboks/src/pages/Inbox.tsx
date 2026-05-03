import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { MessageRow } from "@/components/inbox/MessageRow";
import { conversations as MOCK_CONVERSATIONS, Channel } from "@/data/conversations";
import type { Conversation } from "@/data/conversations";
import { useConversations } from "@/hooks/use-client-api";
import { platformToChannel } from "@/lib/channel-map";
import type { ApiConversation } from "@/lib/api";
import type { NavId } from "@/components/inbox/Drawer";
import { useEnabledChannels } from "@/hooks/use-enabled-channels";

function mapApiConversation(c: ApiConversation): Conversation {
  const parts = c.lastMessage?.split("\n") ?? [];
  const subject = parts[0]?.slice(0, 80) || "New message";
  const preview = parts.slice(1).join(" ").trim() || c.lastMessage || "";
  return {
    id: c.phone,
    channel: platformToChannel(c.platform),
    sender: c.name || c.phone,
    subject,
    preview,
    timestamp: c.timestamp,
    unread: c.unread ?? false,
    escalated: c.escalated ?? false,
    hasAttachment: c.hasAttachment ?? false,
  };
}

const PAGE_NAV_IDS: NavId[] = ["bookings", "settings", "analytics"];
const PAGE_ROUTES: Partial<Record<NavId, string>> = {
  bookings: "/bookings",
  settings: "/settings",
  analytics: "/analytics",
};

const NAV_LABELS: Record<string, string> = {
  inbox: "Inbox",
  escalations: "Escalations",
};

export default function Inbox() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQueryState] = useState("");
  const [activeNav, setActiveNavState] = useState<NavId>("inbox");
  const { isChannelEnabled } = useEnabledChannels();

  const { data: apiConversations, isLoading, isError } = useConversations();

  const allConversations: Conversation[] = useMemo(() => {
    if (isError || !apiConversations) return MOCK_CONVERSATIONS;
    return apiConversations.map(mapApiConversation);
  }, [apiConversations, isError]);

  const setSearchQuery = (q: string) => setSearchQueryState(q);

  const handleNavSelect = (id: NavId) => {
    const route = PAGE_ROUTES[id];
    if (route) { navigate(route); return; }
    setActiveNavState(id);
    setSearchQueryState("");
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
          c.sender.toLowerCase().includes(q) ||
          c.subject.toLowerCase().includes(q) ||
          c.preview.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allConversations, activeNav, searchQuery, isChannelEnabled]);

  return (
    <DashboardShell
      activeNav={activeNav}
      onNavSelect={handleNavSelect}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      pageTitle={sectionTitle}
      titleSuffix={
        isLoading ? <span className="text-[12px] text-[#1a73e8]">Loading…</span>
          : isError ? <span className="text-[12px] text-[#d93025]">(preview mode)</span>
          : null
      }
    >
      {filtered.length > 0 ? (
        filtered.map((conv) => <MessageRow key={conv.id} conversation={conv} />)
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <p className="text-[14px] text-[#5f6368]">No conversations to show.</p>
        </div>
      )}
    </DashboardShell>
  );
}
