import { useState, useMemo, useCallback, ReactNode } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/inbox/Header";
import { Drawer, NavId } from "@/components/inbox/Drawer";
import type { Channel, Conversation } from "@/data/conversations";
import { useConversations, useEscalations } from "@/hooks/use-client-api";
import { mapApiConversation } from "@/lib/conversation-mapper";
import { useAuth } from "@/components/auth/useAuth";

const EXTERNAL_ROUTES: Partial<Record<NavId, string>> = {
  bookings: "/bookings",
  settings: "/settings",
  analytics: "/analytics",
};

/** Inbox-context nav ids — they all live on "/" and are filtered locally. */
function isInboxContext(id: NavId): boolean {
  return id === "inbox" || id === "escalations" || id.startsWith("channel:");
}

/**
 * Cross-route nav intent. When the user clicks an inbox-context item from a
 * non-Inbox page (Bookings/Analytics/Settings), we navigate to "/" but the
 * Inbox page is not mounted yet, so calling onNavSelect is a no-op. We park
 * the intent in sessionStorage and Inbox consumes it on mount.
 */
export const PENDING_NAV_KEY = "unboks:pending-nav";

interface DashboardShellProps {
  activeNav: NavId;
  onNavSelect?: (id: NavId) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  pageTitle: ReactNode;
  /** Optional subtitle rendered under the page title in the header. */
  pageSubtitle?: ReactNode;
  /**
   * Legacy slot — historically rendered next to the small grey page label.
   * Now folded into the title-block subtitle so loading/error chips still appear.
   */
  titleSuffix?: ReactNode;
  children: ReactNode;
}

export function DashboardShell({
  activeNav,
  onNavSelect,
  searchQuery = "",
  onSearchChange,
  pageTitle,
  pageSubtitle,
  titleSuffix,
  children,
}: DashboardShellProps) {
  const [location, navigate] = useLocation();
  const { logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: apiConversations, isLoading: convLoading, isError } = useConversations();
  const { data: apiEscalations, isLoading: escLoading } = useEscalations();

  // Never fall back to MOCK on the live dashboard — that flashes fake names
  // and counts on every refresh. Use [] until the API returns real data.
  const allConversations: Conversation[] = useMemo(() => {
    if (!apiConversations || isError) return [];
    return apiConversations.map(mapApiConversation);
  }, [apiConversations, isError]);

  const hasConvData = !convLoading && !isError && Boolean(apiConversations);
  const hasEscData = !escLoading && Boolean(apiEscalations);

  const channelCounts = useMemo(() => {
    const counts: Record<Channel, number> = {
      All: hasConvData ? allConversations.length : 0,
      WhatsApp: 0, Email: 0, Instagram: 0, Facebook: 0,
      X: 0, TikTok: 0, Messenger: 0, Unknown: 0,
    };
    if (hasConvData) {
      allConversations.forEach((c) => { counts[c.channel] = (counts[c.channel] || 0) + 1; });
    }
    return counts;
  }, [allConversations, hasConvData]);

  const inboxCount = useMemo(
    () => (hasConvData ? allConversations.filter((c) => c.unread).length : 0),
    [allConversations, hasConvData],
  );
  const escalationsCount = useMemo(
    () => (hasEscData ? (apiEscalations?.filter((e) => !e.resolved).length ?? 0) : 0),
    [apiEscalations, hasEscData],
  );

  const handleNavSelect = useCallback(
    (id: NavId) => {
      // Always close the mobile drawer first — independent of routing.
      setDrawerOpen(false);

      // External routes: navigate away. The Inbox page is unmounted so we
      // don't need to call onNavSelect for filter state.
      const externalRoute = EXTERNAL_ROUTES[id];
      if (externalRoute) {
        if (location !== externalRoute) navigate(externalRoute);
        onNavSelect?.(id);
        return;
      }

      // Inbox-context (inbox / escalations / channel:*): all live on "/".
      // Make sure we land on "/" first so the Inbox page is mounted, THEN
      // unconditionally notify the page so it always updates its local
      // filter state — even when re-clicking the same channel or switching
      // back and forth between channels (no route change in that case).
      if (isInboxContext(id)) {
        if (location !== "/") {
          // Park the intent so Inbox can apply it on mount (since
          // onNavSelect on the current page may not be wired).
          try {
            sessionStorage.setItem(PENDING_NAV_KEY, id);
          } catch {
            // sessionStorage unavailable — fall back to onNavSelect only.
          }
          navigate("/");
        }
        onNavSelect?.(id);
        return;
      }

      // Fallback (shouldn't happen): just notify.
      onNavSelect?.(id);
    },
    [location, navigate, onNavSelect],
  );

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
          title={pageTitle}
          subtitle={pageSubtitle ?? titleSuffix}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          onOpenDrawer={() => setDrawerOpen(true)}
        />

        <main className="flex-1 overflow-y-auto bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
