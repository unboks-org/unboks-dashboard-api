import { useState, useMemo } from "react";
import { Header } from "@/components/inbox/Header";
import { Drawer } from "@/components/inbox/Drawer";
import { MessageRow } from "@/components/inbox/MessageRow";
import { Fab } from "@/components/inbox/Fab";
import { BottomNav } from "@/components/inbox/BottomNav";
import { conversations } from "@/data/conversations";

export default function Inbox() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNav, setActiveNav] = useState("inbox");
  const [bottomTab, setBottomTab] = useState("mail");

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.sender.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const unreadCount = useMemo(
    () => conversations.filter((c) => c.unread).length,
    []
  );

  return (
    <div className="flex flex-col h-screen w-full bg-white overflow-hidden font-sans mx-auto max-w-[480px] sm:max-w-[560px] sm:shadow-xl sm:my-0 relative">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      <div className="px-5 pt-2 pb-2 flex-shrink-0">
        <h2 className="text-[14px] text-[#5f6368]">Inbox</h2>
      </div>

      <main className="flex-1 overflow-y-auto bg-white">
        {filtered.length > 0 ? (
          filtered.map((conv) => <MessageRow key={conv.id} conversation={conv} />)
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <p className="text-[14px] text-[#5f6368]">No messages match your search.</p>
          </div>
        )}
        <div className="h-24" aria-hidden="true" />
      </main>

      <Fab />

      <BottomNav
        active={bottomTab}
        onChange={setBottomTab}
        mailBadge={unreadCount}
        chatBadge={12}
      />

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        active={activeNav}
        onSelect={(id) => {
          setActiveNav(id);
          setDrawerOpen(false);
        }}
        inboxCount={unreadCount}
      />
    </div>
  );
}
