import { useState, useMemo } from "react";
import { Header } from "@/components/inbox/Header";
import { Drawer, NavId } from "@/components/inbox/Drawer";
import { MessageRow } from "@/components/inbox/MessageRow";
import { BottomNav } from "@/components/inbox/BottomNav";
import { conversations as MOCK_CONVERSATIONS, Channel } from "@/data/conversations";
import type { Conversation } from "@/data/conversations";
import { useConversations } from "@/hooks/use-client-api";
import { platformToChannel } from "@/lib/channel-map";
import type { ApiConversation } from "@/lib/api";
import { useAuth } from "@/components/auth/useAuth";

// Map API conversation → our UI's Conversation shape
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

const NAV_LABELS: Record<string, string> = {
  inbox: "Inbox",
  escalations: "Escalations",
  bookings: "Bookings",
  settings: "Settings",
};

export default function Inbox() {
  const { logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQueryState] = useState("");
  const [activeNav, setActiveNavState] = useState<NavId>("inbox");
  const [bottomTab, setBottomTab] = useState("mail");

  // Real API data — falls back to mocks on error
  const { data: apiConversations, isLoading, isError } = useConversations();

  const allConversations: Conversation[] = useMemo(() => {
    if (isError || !apiConversations) return MOCK_CONVERSATIONS;
    return apiConversations.map(mapApiConversation);
  }, [apiConversations, isError]);

  // Clear selection on filter/search change
  const setSearchQuery = (q: string) => setSearchQueryState(q);
  const setActiveNav = (id: NavId) => {
    setActiveNavState(id);
    setSearchQueryState("");
  };

  const channelCounts = useMemo(() => {
    const counts: Record<Channel, number> = {
      All: allConversations.length,
      WhatsApp: 0, Email: 0, Instagram: 0, Facebook: 0,
      X: 0, TikTok: 0, Messenger: 0,
    };
    allConversations.forEach((c) => {
      counts[c.channel] = (counts[c.channel] || 0) + 1;
    });
    return counts;
  }, [allConversations]);

  const inboxCount = useMemo(
    () => allConversations.filter((c) => c.unread).length,
    [allConversations],
  );
  const escalationsCount = useMemo(
    () => allConversations.filter((c) => c.escalated).length,
    [allConversations],
  );

  const sectionTitle = useMemo(() => {
    if (activeNav.startsWith("channel:")) return activeNav.split(":")[1];
    return NAV_LABELS[activeNav] || "Inbox";
  }, [activeNav]);

  const filtered = useMemo(() => {
    let list = allConversations;

    if (activeNav === "escalations") {
      list = list.filter((c) => c.escalated);
    } else if (activeNav === "bookings") {
      list = list.filter((c) =>
        /booking|reschedul|appointment/i.test(c.subject + " " + c.preview),
      );
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
  }, [allConversations, activeNav, searchQuery]);

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden font-sans">
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        active={activeNav}
        onSelect={(id) => {
          setActiveNav(id);
          setDrawerOpen(false);
        }}
        onLogout={logout}
        inboxCount={inboxCount}
        escalationsCount={escalationsCount}
        channelCounts={channelCounts}
      />

      <div className="flex flex-col flex-1 min-w-0 mx-auto max-w-[480px] sm:max-w-[560px] sm:shadow-xl md:max-w-none md:mx-0 md:shadow-none relative">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenDrawer={() => setDrawerOpen(true)}
        />

        <div className="px-5 pt-2 pb-2 flex-shrink-0">
          <h2 className="text-[14px] text-[#5f6368]">
            {sectionTitle}
            {isLoading && (
              <span className="ml-2 text-[12px] text-[#1a73e8]">Loading…</span>
            )}
            {isError && !isLoading && (
              <span className="ml-2 text-[12px] text-[#d93025]">(preview mode)</span>
            )}
          </h2>
        </div>

        <main className="flex-1 overflow-y-auto bg-white">
          {filtered.length > 0 ? (
            filtered.map((conv) => (
              <MessageRow key={conv.id} conversation={conv} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <p className="text-[14px] text-[#5f6368]">No conversations to show.</p>
            </div>
          )}
          <div className="h-24" aria-hidden="true" />
        </main>

        <div className="md:hidden">
          <BottomNav
            active={bottomTab}
            onChange={setBottomTab}
            mailBadge={inboxCount}
            chatBadge={channelCounts.WhatsApp + channelCounts.Messenger}
          />
        </div>
      </div>
    </div>
  );
}
