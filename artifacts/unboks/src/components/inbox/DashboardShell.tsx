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
import { useArchivedConversations } from "@/hooks/use-archived-conversations";
import { useActiveConversationKeys } from "@/hooks/use-active-conversation-keys";
import { filterActiveAppointments } from "@/lib/appointment-classifier";

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
  // Sidebar counts must respect locally-hidden AND locally-archived
  // rows so the badges never disagree with the lists rendered in
  // Inbox / Escalations. Same hooks + key-collection helper used by
  // the page filters in `pages/Inbox.tsx`.
  const { isHidden: isRowHidden } = useHiddenConversations();
  const { isArchived: isRowArchived } = useArchivedConversations();

  // Never fall back to MOCK on the live dashboard — that flashes fake names
  // and counts on every refresh. Use [] until the API returns real data.
  // `allConversations` is the post-delete (hidden) set; we still keep
  // archived rows in here so the Escalations badge — which intentionally
  // bypasses archive in `pages/Inbox.tsx` — can resolve its convo lookup.
  const allConversations: Conversation[] = useMemo(() => {
    if (!apiConversations || isError) return [];
    return apiConversations
      .map(mapApiConversation)
      .filter((c) => !isRowHidden(collectConversationHideKeys(c)));
  }, [apiConversations, isError, isRowHidden]);

  const hasConvData = !convLoading && !isError && Boolean(apiConversations);
  const hasEscData = !escLoading && Boolean(apiEscalations);

  // Active inbox subset = not deleted AND not archived. Mirrors the
  // exact predicate the Inbox active view uses (line ~930 of Inbox.tsx),
  // including the `c.timestampMs` arg so a fresh inbound auto-restores
  // an archived row in both the list and the badge simultaneously.
  // This is the source for every channel + inbox sidebar count, so the
  // badge can never claim more rows than the active inbox actually shows.
  const activeConversations = useMemo(
    () =>
      allConversations.filter(
        (c) => !isRowArchived(collectConversationHideKeys(c), c.timestampMs),
      ),
    [allConversations, isRowArchived],
  );

  const channelCounts = useMemo(() => {
    const counts: Record<Channel, number> = {
      All: hasConvData ? activeConversations.length : 0,
      WhatsApp: 0, Email: 0, Instagram: 0, Facebook: 0,
      X: 0, TikTok: 0, Messenger: 0, Unknown: 0,
    };
    if (hasConvData) {
      activeConversations.forEach((c) => { counts[c.channel] = (counts[c.channel] || 0) + 1; });
    }
    return counts;
  }, [activeConversations, hasConvData]);

  const inboxCount = useMemo(
    () => (hasConvData ? activeConversations.filter((c) => c.unread).length : 0),
    [activeConversations, hasConvData],
  );
  // Use the same normalizer AND the same dedup pass as the Escalations
  // list so the sidebar count and the rendered list can never disagree
  // (the backend can emit several rows per active conversation; the list
  // collapses them, so the count must too). Also apply the archive
  // overlay — archived escalations must NOT contribute to the badge,
  // matching the persistence brief and the Escalations page filter.
  const escalationsCount = useMemo(() => {
    if (!hasEscData || !apiEscalations) return 0;
    const active = [];
    for (const raw of apiEscalations as unknown[]) {
      const e = normalizeEscalation(raw);
      if (e && !e.resolved) active.push(e);
    }
    // Apply the same hide AND archive filters the Escalations page
    // uses. We mirror `escalationToConversationRow`'s key derivation:
    // routable phone (or synthesized `esc:<id>`), plus the escalation
    // id itself. The archive check also receives the enrichment row's
    // `timestampMs` so the auto-restore-on-new-inbound path stays in
    // lockstep with the Inbox list (a fresh inbound un-archives the
    // row in both surfaces on the same render).
    const convoByPhone = new Map(allConversations.map((c) => [c.id, c]));
    return dedupeEscalations(active).filter((n) => {
      const enrich = n.phone ? convoByPhone.get(n.phone) ?? null : null;
      const conversationKey = enrich?.conversationKey ?? n.phone ?? `esc:${n.id}`;
      const id = n.phone || `esc:${n.id}`;
      const keys = [conversationKey, id, n.id];
      if (isRowHidden(keys)) return false;
      if (isRowArchived(keys, enrich?.timestampMs)) return false;
      return true;
    }).length;
  }, [apiEscalations, hasEscData, allConversations, isRowHidden, isRowArchived]);

  // Appointments sidebar count must use the same merged + de-duplicated
  // list the Appointments page renders, so the badge can never disagree
  // with the visible rows. `useAppointments` already merges backend rows
  // with detected ones and dedups by `${conversationId}|${dateTimeLabel}`
  // (backend wins). On top of that we apply `filterActiveAppointments`
  // — the same shared predicate `pages/Bookings.tsx` runs on its list —
  // so an appointment whose owning conversation has been archived or
  // deleted is dropped from the badge in the same render tick that it
  // disappears from the page. Without this filter, archiving the only
  // conversation tied to a detected appointment leaves the badge stuck
  // at "1" while the page shows "No appointments yet" (the bug this
  // change fixes).
  const { appointments } = useAppointments();
  const { keys: activeConversationKeys, ready: convKeysReady } =
    useActiveConversationKeys();
  const appointmentsCount = useMemo(
    () =>
      filterActiveAppointments(appointments, activeConversationKeys, convKeysReady)
        .length,
    [appointments, activeConversationKeys, convKeysReady],
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

      {/* Main column.
          Previously capped to max-w-[480px] / sm:max-w-[560px] with a
          drop shadow, which on real mobile + small-tablet widths
          (375–767px) made the app render as a centered phone-frame
          demo with side gutters instead of a full-bleed app. The cap
          and shadow are removed below md so the app fills the device
          width naturally; the desktop layout is unchanged. */}
      <div className="flex flex-col flex-1 min-w-0 relative">
        <Header
          title={pageTitle}
          subtitle={pageSubtitle ?? titleSuffix}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          onOpenDrawer={() => setDrawerOpen(true)}
        />

        {/* Main content scroll region.
            Bottom padding respects the iOS Safari safe-area inset so
            content (and any sticky footer like the composer) is never
            hidden under the browser chrome / home indicator. */}
        <main
          className="flex-1 overflow-y-auto bg-white"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
