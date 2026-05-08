import { useState, useMemo, useCallback, ReactNode } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/inbox/Header";
import { Drawer, NavId } from "@/components/inbox/Drawer";
import type { Channel, Conversation } from "@/data/conversations";
import { useConversations, useEscalations } from "@/hooks/use-client-api";
import { mapApiConversation, normalizeEscalation } from "@/lib/conversation-mapper";
import { dedupeEscalations } from "@/lib/dedupe-escalations";
import { useAppointments } from "@/hooks/use-appointments";
import { useAuth } from "@/components/auth/useAuth";
import {
  useHiddenConversations,
  collectConversationHideKeys,
} from "@/hooks/use-hidden-conversations";

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
  // Sidebar counts must respect locally-hidden rows so the badges
  // never disagree with the lists rendered in Inbox / Escalations.
  // Same hook + same key-collection helper used by the page filters.
  const { isHidden: isRowHidden } = useHiddenConversations();

  // Never fall back to MOCK on the live dashboard — that flashes fake names
  // and counts on every refresh. Use [] until the API returns real data.
  const allConversations: Conversation[] = useMemo(() => {
    if (!apiConversations || isError) return [];
    return apiConversations
      .map(mapApiConversation)
      .filter((c) => !isRowHidden(collectConversationHideKeys(c)));
  }, [apiConversations, isError, isRowHidden]);

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
  // Use the same normalizer AND the same dedup pass as the Escalations
  // list so the sidebar count and the rendered list can never disagree
  // (the backend can emit several rows per active conversation; the list
  // collapses them, so the count must too).
  const escalationsCount = useMemo(() => {
    if (!hasEscData || !apiEscalations) return 0;
    const active = [];
    for (const raw of apiEscalations as unknown[]) {
      const e = normalizeEscalation(raw);
      if (e && !e.resolved) active.push(e);
    }
    // Apply the same hide filter the Escalations page uses, so the
    // badge can never claim more rows than the list actually shows.
    // We mirror `escalationToConversationRow`'s key derivation:
    // routable phone (or synthesized `esc:<id>`), plus the escalation
    // id itself.
    const convoByPhone = new Map(allConversations.map((c) => [c.id, c]));
    return dedupeEscalations(active).filter((n) => {
      const enrich = n.phone ? convoByPhone.get(n.phone) ?? null : null;
      const conversationKey = enrich?.conversationKey ?? n.phone ?? `esc:${n.id}`;
      const id = n.phone || `esc:${n.id}`;
      return !isRowHidden([conversationKey, id, n.id]);
    }).length;
  }, [apiEscalations, hasEscData, allConversations, isRowHidden]);

  // Appointments sidebar count must use the same merged + de-duplicated
  // list the Appointments page renders, so the badge can never disagree
  // with the visible rows. `useAppointments` already merges backend rows
  // with detected ones and dedups by `${conversationId}|${dateTimeLabel}`
  // (backend wins). All current statuses (`confirmed`, `pending`,
  // `detected`) are active and visible on the page, so the count is
  // simply the array length. If a `cancelled` / `completed` status is
  // ever added, exclude it here so the count still matches the page.
  const { appointments } = useAppointments();
  const appointmentsCount = useMemo(
    () => appointments.filter((a) => a.status !== ("cancelled" as typeof a.status) && a.status !== ("completed" as typeof a.status)).length,
    [appointments],
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
        appointmentsCount={appointmentsCount}
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
