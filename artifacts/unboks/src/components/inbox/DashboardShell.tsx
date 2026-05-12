import { useState, useMemo, useCallback, ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { Header } from "@/components/inbox/Header";
import { Drawer, NavId } from "@/components/inbox/Drawer";
import { Channel, Conversation } from "@/data/conversations";
import { useConversations, useEscalations } from "@/hooks/use-client-api";
import { mapApiConversation, normalizeEscalation } from "@/lib/conversation-mapper";
import { dedupeEscalations } from "@/lib/dedupe-escalations";
import { useAppointments } from "@/hooks/use-appointments";
import { useAuth } from "@/components/auth/useAuth";
import {
  useHiddenConversations,
  collectConversationHideKeys,
} from "@/hooks/use-hidden-conversations";
import { useBlockedLookup } from "@/hooks/use-blocked-senders";
import { useArchivedConversations } from "@/hooks/use-archived-conversations";
import { useActiveConversationKeys } from "@/hooks/use-active-conversation-keys";
import { filterActiveAppointments } from "@/lib/appointment-classifier";
import { RefreshButton } from "@/components/inbox/RefreshButton";

const EXTERNAL_ROUTES: Partial<Record<NavId, string>> = {
  bookings: "/bookings",
  settings: "/settings",
  analytics: "/analytics",
};

/** Inbox-context nav ids — they all live on the Inbox surface (path "/"
 *  or "/escalations") and the channel filter is encoded as `?channel=X`
 *  so the URL — not local state — is the source of truth for which view
 *  the operator is on. This is what makes refresh / crash-recovery /
 *  post-login bounce land back on the same view rather than dumping the
 *  operator to Inbox. */
function isInboxContext(id: NavId): boolean {
  return id === "inbox" || id === "escalations" || id.startsWith("channel:");
}

/**
 * Legacy cross-route nav intent. Inbox-context navigation is now URL-driven
 * (see `inboxContextUrl` below) so this key is no longer written by the
 * sidebar. Exported only so Inbox can drain any leftover value parked by
 * a previous build, then it can be retired entirely.
 */
export const PENDING_NAV_KEY = "unboks:pending-nav";

/**
 * Canonical URL for an inbox-context nav id. Used by both DashboardShell
 * (sidebar clicks) and Inbox (in-page nav handler) so navigation always
 * updates the URL — that's how a refresh restores the same view.
 *
 *   inbox          → /
 *   escalations    → /escalations
 *   channel:Email  → /?channel=Email
 */
export function inboxContextUrl(id: NavId): string {
  if (id === "escalations") return "/escalations";
  if (id.startsWith("channel:")) {
    const ch = id.slice("channel:".length);
    return `/?channel=${encodeURIComponent(ch)}`;
  }
  return "/";
}

/** Inverse of `inboxContextUrl`: derive the active nav id from the
 *  current router-relative path + search string. Falls back to "inbox"
 *  for unknown shapes. Kept here next to `inboxContextUrl` so the two
 *  can never drift. */
export function navIdFromInboxUrl(
  pathname: string,
  search: string,
  isChannelEnabled: (ch: Channel) => boolean,
): NavId {
  if (pathname.startsWith("/escalations")) return "escalations";
  if (pathname === "/" || pathname === "") {
    try {
      const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      // Legacy query-string deep links from older alert email templates
      // and hand-crafted bookmarks: `?view=escalations` (and the
      // `?escalationId=...` shortcut) must still land on the
      // Escalations tab. The deep-link effect in Inbox handles the
      // row-open + query strip; here we only need the tab.
      if (params.get("view") === "escalations" || params.get("escalationId")) {
        return "escalations";
      }
      const ch = params.get("channel");
      if (ch) {
        const cap = ch as Channel;
        // Only honour channels the workspace currently exposes — a stale
        // bookmark to a disabled channel falls back to Inbox.
        if (isChannelEnabled(cap)) return `channel:${cap}` as NavId;
      }
    } catch {
      // ignore — fall through to inbox
    }
    return "inbox";
  }
  return "inbox";
}

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
  /**
   * Hide the manual Refresh button in the header. Used by Settings
   * where the page is a form and a global refetch would feel out of
   * place. Defaults to false (button visible everywhere else).
   */
  hideRefresh?: boolean;
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
  hideRefresh = false,
  children,
}: DashboardShellProps) {
  const [location, navigate] = useLocation();
  const search = useSearch();
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
  // Server-backed blocked senders. Same lookup the Inbox page filters
  // use, so the sidebar badges never count rows the lists hide as
  // "blocked in Unboks". The hook exposes a Set-backed predicate so
  // the cost is O(keys-per-row) per render.
  const { isBlocked: isRowBlocked } = useBlockedLookup();

  // Never fall back to MOCK on the live dashboard — that flashes fake names
  // and counts on every refresh. Use [] until the API returns real data.
  // `allConversations` is the post-delete (hidden) set; we still keep
  // archived rows in here so the Escalations badge — which intentionally
  // bypasses archive in `pages/Inbox.tsx` — can resolve its convo lookup.
  const allConversations: Conversation[] = useMemo(() => {
    if (!apiConversations || isError) return [];
    return apiConversations
      .map(mapApiConversation)
      .filter((c) => {
        const keys = collectConversationHideKeys(c);
        return !isRowHidden(keys) && !isRowBlocked(keys);
      });
  }, [apiConversations, isError, isRowHidden, isRowBlocked]);

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
      if (isRowBlocked(keys)) return false;
      if (isRowArchived(keys, enrich?.timestampMs)) return false;
      return true;
    }).length;
  }, [apiEscalations, hasEscData, allConversations, isRowHidden, isRowArchived, isRowBlocked]);

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

      // Inbox-context (inbox / escalations / channel:*): always navigate
      // to the canonical URL so the URL is the source of truth for which
      // view the operator is on. A refresh / crash-recovery / 401 bounce
      // can then restore exactly the same view from the URL — instead of
      // dumping the operator to Inbox the way the previous "park intent
      // in sessionStorage" approach did.
      if (isInboxContext(id)) {
        const target = inboxContextUrl(id);
        const here = location + (search ? `?${search}` : "");
        if (here !== target) navigate(target);
        onNavSelect?.(id);
        return;
      }

      // Fallback (shouldn't happen): just notify.
      onNavSelect?.(id);
    },
    [location, search, navigate, onNavSelect],
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
          rightSlot={hideRefresh ? null : <RefreshButton />}
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
