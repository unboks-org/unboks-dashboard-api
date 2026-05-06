import { useState, useMemo, ReactNode } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/inbox/Header";
import { Drawer, NavId } from "@/components/inbox/Drawer";
import type { Channel, Conversation } from "@/data/conversations";
import { useConversations, useEscalations } from "@/hooks/use-client-api";
import { mapApiConversation } from "@/lib/conversation-mapper";
import { conversations as MOCK } from "@/data/conversations";
import { useAuth } from "@/components/auth/useAuth";

const PAGE_ROUTES: Partial<Record<NavId, string>> = {
  bookings: "/bookings",
  settings: "/settings",
  analytics: "/analytics",
  inbox: "/",
};

interface DashboardShellProps {
  activeNav: NavId;
  onNavSelect?: (id: NavId) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  pageTitle: string;
  titleSuffix?: ReactNode;
  children: ReactNode;
}

export function DashboardShell({
  activeNav,
  onNavSelect,
  searchQuery = "",
  onSearchChange,
  pageTitle,
  titleSuffix,
  children,
}: DashboardShellProps) {
  const [, navigate] = useLocation();
  const { logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: apiConversations, isError } = useConversations();
  const { data: apiEscalations } = useEscalations();

  const allConversations: Conversation[] = useMemo(() => {
    if (isError || !apiConversations) return MOCK;
    return apiConversations.map(mapApiConversation);
  }, [apiConversations, isError]);

  const channelCounts = useMemo(() => {
    const counts: Record<Channel, number> = {
      All: allConversations.length,
      WhatsApp: 0, Email: 0, Instagram: 0, Facebook: 0,
      X: 0, TikTok: 0, Messenger: 0, Unknown: 0,
    };
    allConversations.forEach((c) => { counts[c.channel] = (counts[c.channel] || 0) + 1; });
    return counts;
  }, [allConversations]);

  const inboxCount = useMemo(() => allConversations.filter((c) => c.unread).length, [allConversations]);
  const escalationsCount = useMemo(
    () => apiEscalations?.filter((e) => !e.resolved).length ?? allConversations.filter((c) => c.escalated).length,
    [apiEscalations, allConversations],
  );

  const handleNavSelect = (id: NavId) => {
    const route = PAGE_ROUTES[id];
    if (route) {
      navigate(route);
    } else {
      onNavSelect?.(id);
    }
    setDrawerOpen(false);
  };

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden font-sans">
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        active={activeNav}
        onSelect={handleNavSelect}
        onLogout={logout}
        inboxCount={inboxCount}
        escalationsCount={escalationsCount}
        channelCounts={channelCounts}
      />

      <div className="flex flex-col flex-1 min-w-0 mx-auto max-w-[480px] sm:max-w-[560px] sm:shadow-xl md:max-w-none md:mx-0 md:shadow-none relative">
        <Header
          searchQuery={searchQuery}
          onSearchChange={onSearchChange ?? (() => {})}
          onOpenDrawer={() => setDrawerOpen(true)}
        />

        <div className="px-5 pt-2 pb-2 flex-shrink-0 flex items-center gap-2">
          <h2 className="text-[14px] text-[#5f6368]">{pageTitle}</h2>
          {titleSuffix}
        </div>

        <main className="flex-1 overflow-y-auto bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
