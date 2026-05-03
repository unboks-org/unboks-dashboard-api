import { useState, useMemo } from "react";
import { Header } from "@/components/inbox/Header";
import { Drawer, NavId } from "@/components/inbox/Drawer";
import { MessageRow } from "@/components/inbox/MessageRow";
import { Fab } from "@/components/inbox/Fab";
import { BottomNav } from "@/components/inbox/BottomNav";
import { conversations, Channel } from "@/data/conversations";

const CHANNEL_LIST: Channel[] = [
  "WhatsApp",
  "Email",
  "Instagram",
  "Facebook",
  "X",
  "TikTok",
  "Messenger",
];

const NAV_LABELS: Record<string, string> = {
  inbox: "Inbox",
  escalations: "Escalations",
  bookings: "Bookings",
  settings: "Settings",
};

export default function Inbox() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNav, setActiveNav] = useState<NavId>("inbox");
  const [bottomTab, setBottomTab] = useState("mail");

  const channelCounts = useMemo(() => {
    const counts: Record<Channel, number> = {
      All: conversations.length,
      WhatsApp: 0, Email: 0, Instagram: 0, Facebook: 0, X: 0, TikTok: 0, Messenger: 0,
    };
    conversations.forEach((c) => {
      counts[c.channel] = (counts[c.channel] || 0) + 1;
    });
    return counts;
  }, []);

  const inboxCount = useMemo(
    () => conversations.filter((c) => c.unread).length,
    []
  );
  const escalationsCount = useMemo(
    () => conversations.filter((c) => c.escalated).length,
    []
  );

  const sectionTitle = useMemo(() => {
    if (activeNav.startsWith("channel:")) return activeNav.split(":")[1];
    return NAV_LABELS[activeNav] || "Inbox";
  }, [activeNav]);

  const filtered = useMemo(() => {
    let list = conversations;

    if (activeNav === "escalations") {
      list = list.filter((c) => c.escalated);
    } else if (activeNav === "bookings") {
      list = list.filter((c) => /booking|reschedul|appointment/i.test(c.subject + " " + c.preview));
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
          c.preview.toLowerCase().includes(q)
      );
    }

    return list;
  }, [activeNav, searchQuery]);

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
          <h2 className="text-[14px] text-[#5f6368]">{sectionTitle}</h2>
        </div>

        <main className="flex-1 overflow-y-auto bg-white">
          {filtered.length > 0 ? (
            filtered.map((conv) => <MessageRow key={conv.id} conversation={conv} />)
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <p className="text-[14px] text-[#5f6368]">No conversations to show.</p>
            </div>
          )}
          <div className="h-24" aria-hidden="true" />
        </main>

        <Fab />

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
