import { useState, useMemo, useCallback, ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { Header } from "@/components/inbox/Header";
import { Drawer, NavId } from "@/components/inbox/Drawer";
import { BottomNav } from "@/components/inbox/BottomNav";
import { Channel, Conversation } from "@/data/conversations";
import { useConversations, useEscalations } from "@/hooks/use-client-api";
import {
  escalationToConversationRow,
  mapApiConversation,
  normalizeEscalation,
} from "@/lib/conversation-mapper";
import { dedupeEscalations } from "@/lib/dedupe-escalations";
import { useAppointments } from "@/hooks/use-appointments";
import { useAuth } from "@/components/auth/useAuth";
import {
  useHiddenConversations,
  collectConversationHideKeys,
} from "@/hooks/use-hidden-conversations";
import { useBlockedLookup } from "@/hooks/use-blocked-senders";
import { useActiveConversationKeys } from "@/hooks/use-active-conversation-keys";
import { filterActiveAppointments } from "@/lib/appointment-classifier";
import { RefreshButton } from "@/components/inbox/RefreshButton";
import { OnboardingBanner } from "@/components/onboarding/OnboardingBanner";
import { motion, AnimatePresence } from "framer-motion";

const EXTERNAL_ROUTES: Partial<Record<NavId, string>> = {
  bookings: "/bookings",
  settings: "/settings",
  analytics: "/analytics",
  help: "/help",
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
  isChannelVisible: (ch: Channel) => boolean,
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
        if (isChannelVisible(cap)) return `channel:${cap}` as NavId;
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
  // Sidebar counts must respect locally-hidden rows so the badges never
  // disagree with rows removed through the delete/hide fallback. Archive
  // state is server-backed now; do not consult the old local archive
  // overlay here or a stale browser key can suppress valid server rows.
  const { isHidden: isRowHidden } = useHiddenConversations();
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
  // Pre-block-filter projection. Used as the source for the
  // Escalations badge so an escalation row whose owning conversation
  // is blocked still resolves to the correct `conversationKey` before
  // the blocked filter drops it from the count — keeping the badge
  // and the rendered list (Inbox.tsx applies the same trick) in
  // lockstep when an email escalation is blocked.
  const enrichmentConversations: Conversation[] = useMemo(() => {
    if (!apiConversations || isError) return [];
    return apiConversations
      .map(mapApiConversation)
      .filter((c) => !isRowHidden(collectConversationHideKeys(c)));
  }, [apiConversations, isError, isRowHidden]);

  const allConversations: Conversation[] = useMemo(() => {
    return enrichmentConversations.filter(
      (c) => !isRowBlocked(collectConversationHideKeys(c)),
    );
  }, [enrichmentConversations, isRowBlocked]);

  const hasConvData = !convLoading && !isError && Boolean(apiConversations);
  const hasEscData = !escLoading && Boolean(apiEscalations);

  // Active inbox subset = conversations returned by the server after
  // local delete/hide and block filters. Archive state is intentionally
  // not applied from localStorage; the backend archive endpoints are the
  // source of truth and should decide whether a row appears in the
  // active conversation list.
  const activeConversations = useMemo(
    () => allConversations,
    [allConversations],
  );

  const channelCounts = useMemo(() => {
    const counts: Record<Channel, number> = {
      All: hasConvData ? activeConversations.length : 0,
      WhatsApp: 0, Email: 0, Instagram: 0, Facebook: 0,
      X: 0, TikTok: 0, Telegram: 0, Messenger: 0, Unknown: 0,
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
  // collapses them, so the count must too). Archive state is server-side;
  // this count deliberately avoids the old local archive overlay.
  const escalationsCount = useMemo(() => {
    if (!hasEscData || !apiEscalations) return 0;
    const active = [];
    for (const raw of apiEscalations as unknown[]) {
      const e = normalizeEscalation(raw);
      if (e && !e.resolved && e.mode !== "order") active.push(e);
    }
    // Apply the same hide and block filters the Escalations page uses.
    // We mirror `escalationToConversationRow`'s key derivation: routable
    // phone (or synthesized `esc:<id>`), plus the escalation id itself.
    // Enrichment lookup must be the pre-block-filter projection so
    // blocked email escalations still resolve to the right
    // `conversationKey` and get caught by the blocked predicate
    // immediately below. See `enrichmentConversations` JSDoc above.
    const convoByPhone = new Map(enrichmentConversations.map((c) => [c.id, c]));
    const query = searchQuery.trim().toLowerCase();
    return dedupeEscalations(active).filter((n) => {
      const enrich = n.phone ? convoByPhone.get(n.phone) ?? null : null;
      const row = escalationToConversationRow(n, enrich);
      const keys = collectConversationHideKeys(row);
      if (isRowHidden(keys)) return false;
      if (isRowBlocked(keys)) return false;
      if (query) {
        return (
          (row.sender ?? "").toLowerCase().includes(query) ||
          (row.subject ?? "").toLowerCase().includes(query) ||
          (row.preview ?? "").toLowerCase().includes(query)
        );
      }
      return true;
    }).length;
  }, [apiEscalations, hasEscData, enrichmentConversations, isRowHidden, isRowBlocked, searchQuery]);

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
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden font-sans">
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

      <div className="flex flex-col flex-1 min-w-0 relative bg-card shadow-[-4px_0_24px_rgba(0,0,0,0.02)] z-20">
        <Header
          title={pageTitle}
          subtitle={pageSubtitle ?? titleSuffix}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          onOpenDrawer={() => setDrawerOpen(true)}
          rightSlot={hideRefresh ? null : <RefreshButton />}
        />

        <main
          className="flex-1 overflow-x-hidden overflow-y-auto relative bg-background"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="h-full flex flex-col">
            <OnboardingBanner />
            {children}
          </div>
        </main>
        <BottomNav
          active={activeNav}
          onChange={handleNavSelect}
          inboxBadge={inboxCount}
          appointmentsBadge={appointmentsCount}
        />
      </div>
    </div>
  );
}
