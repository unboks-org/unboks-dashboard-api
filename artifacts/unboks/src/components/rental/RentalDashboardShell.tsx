import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import {
  CalendarCheck2,
  CarFront,
  ChevronLeft,
  LogOut,
  Menu,
  MessageCircleMore,
  Search,
  Settings,
  ShipWheel,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth/useAuth";
import { useAgentStatus, useSetAgentStatus } from "@/hooks/use-agent-status";
import { useClientProfile } from "@/hooks/use-client-profile";
import {
  hasRentalBackHistory,
  rememberRentalScroll,
  rentalHistoryEntryId,
  rentalNavigationState,
  rentalScrollPosition,
} from "@/lib/rental-navigation-history";
import { getClientSlug } from "@/lib/tenant";
import { isMermaidReservationTenant } from "@/lib/tenant-ui";
import { cn } from "@/lib/utils";

export type RentalNavId =
  | "today"
  | "customers"
  | "reservations"
  | "conversations"
  | "fleet"
  | "trip"
  | "settings";

interface RentalNavItem {
  id: RentalNavId;
  href: string;
  label: string;
  icon: LucideIcon;
}

const rentalItems: RentalNavItem[] = [
  {
    id: "today" as const,
    href: "/today",
    label: "Today",
    icon: CalendarCheck2,
  },
  {
    id: "customers" as const,
    href: "/customers",
    label: "Customers",
    icon: UsersRound,
  },
  {
    id: "conversations" as const,
    href: "/conversations",
    label: "Conversations",
    icon: MessageCircleMore,
  },
  {
    id: "fleet" as const,
    href: "/fleet",
    label: "Fleet & pricing",
    icon: CarFront,
  },
  {
    id: "settings" as const,
    href: "/settings",
    label: "Settings",
    icon: Settings,
  },
];

const mermaidItems: RentalNavItem[] = [
  {
    id: "today" as const,
    href: "/today",
    label: "Today",
    icon: CalendarCheck2,
  },
  {
    id: "reservations" as const,
    href: "/reservations",
    label: "Reservations",
    icon: UsersRound,
  },
  {
    id: "conversations" as const,
    href: "/conversations",
    label: "Conversations",
    icon: MessageCircleMore,
  },
  {
    id: "trip" as const,
    href: "/trip",
    label: "Trip & pricing",
    icon: ShipWheel,
  },
  {
    id: "settings" as const,
    href: "/settings",
    label: "Settings",
    icon: Settings,
  },
];

export function normalizeRentalNav(
  active: string,
  items = rentalItems,
): RentalNavId {
  const mermaid = items === mermaidItems;
  if (mermaid && active === "customers") return "reservations";
  if (mermaid && active === "fleet") return "trip";
  if (active === "followups") return mermaid ? "reservations" : "customers";
  if (active === "rental") return mermaid ? "trip" : "fleet";
  if (
    active === "inbox" ||
    active === "escalations" ||
    active.startsWith("channel:")
  ) {
    return "conversations";
  }
  return items.some((item) => item.id === active)
    ? (active as RentalNavId)
    : "today";
}

interface RentalDashboardShellProps {
  active: string;
  title: ReactNode;
  subtitle?: ReactNode;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  rightSlot?: ReactNode;
  actionCount?: number;
  children: ReactNode;
}

export function RentalDashboardShell({
  active,
  title,
  subtitle,
  searchQuery = "",
  onSearchChange,
  rightSlot,
  actionCount = 0,
  children,
}: RentalDashboardShellProps) {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const { logout } = useAuth();
  const profile = useClientProfile();
  const agent = useAgentStatus();
  const setAgent = useSetAgentStatus();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const restoredEntryRef = useRef<string | null>(null);
  const tenant = getClientSlug();
  const mermaid = isMermaidReservationTenant(tenant);
  const items = mermaid ? mermaidItems : rentalItems;
  const activeNav = normalizeRentalNav(active, items);
  const searchLabel =
    activeNav === "conversations"
      ? "Search conversations"
      : "Search reservations";
  const searchPlaceholder =
    activeNav === "conversations"
      ? "Search guest or message"
      : mermaid
        ? "Search name, WhatsApp, quote or code"
        : "Search name, phone or reference";
  const fallbackBackHref = location.startsWith("/customers/")
    ? "/customers"
    : location.startsWith("/reservations/")
      ? "/reservations"
      : null;
  const hasHistoryBack = hasRentalBackHistory(tenant);
  const showBack = hasHistoryBack || Boolean(fallbackBackHref);
  const businessName =
    profile.data?.name?.trim() ||
    (mermaid ? "Mermaid Boat Trips Curaçao" : "Ali Car Rental");
  const initials =
    businessName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "AR";

  const navigateTo = (href: string) => {
    setMobileOpen(false);
    rememberRentalScroll(tenant, mainRef.current?.scrollTop ?? 0);
    navigate(href, { state: rentalNavigationState(tenant) });
  };

  const navigateBack = () => {
    rememberRentalScroll(tenant, mainRef.current?.scrollTop ?? 0);
    if (hasHistoryBack) {
      window.history.back();
      return;
    }
    if (fallbackBackHref) navigate(fallbackBackHref);
  };

  useEffect(() => {
    const scrollTop = rentalScrollPosition(tenant);
    const entryId = rentalHistoryEntryId(tenant);
    if (
      scrollTop === null ||
      entryId === null ||
      restoredEntryRef.current === entryId
    ) {
      return undefined;
    }
    restoredEntryRef.current = entryId;
    const restore = () => {
      if (mainRef.current) mainRef.current.scrollTop = scrollTop;
    };
    restore();
    const timers = [100, 350, 800].map((delay) =>
      window.setTimeout(restore, delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [location, search, tenant]);

  const sidebar = (
    <div className="flex h-full flex-col bg-[#081c33] text-white">
      <div className="flex min-h-[88px] items-center gap-3 border-b border-white/10 px-5">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-[14px] text-sm font-bold text-[#081c33] shadow-[0_8px_24px_rgba(0,0,0,.2)]",
            mermaid ? "bg-[#65d8d0]" : "bg-[#d4aa58]",
          )}
        >
          {mermaid ? <ShipWheel className="h-5 w-5" /> : initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">
            {businessName}
          </p>
          <p className="mt-0.5 truncate text-xs text-white/50">
            {mermaid ? "TRACY · Guest operations" : "Rental operations"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 md:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-4 py-4">
        <button
          type="button"
          disabled={!agent.data?.available || setAgent.isPending}
          onClick={() => {
            if (agent.data?.available) setAgent.mutate(!agent.data.active);
          }}
          className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-left text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              agent.data?.active ? "bg-emerald-400" : "bg-amber-400",
            )}
          />
          {agent.isLoading
            ? `Checking ${mermaid ? "TRACY" : "Nick"}…`
            : agent.data?.active
              ? `${mermaid ? "TRACY" : "Nick"} is active`
              : `${mermaid ? "TRACY" : "Nick"} is paused`}
        </button>
      </div>

      <nav
        className="flex-1 space-y-1 px-3"
        aria-label={mermaid ? "Mermaid guest operations" : "Rental workspace"}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const selected = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                selected ? setMobileOpen(false) : navigateTo(item.href)
              }
              aria-current={selected ? "page" : undefined}
              className={cn(
                "flex min-h-12 w-full items-center gap-3 rounded-[13px] px-3 text-left text-[14px] font-medium transition",
                selected
                  ? mermaid
                    ? "bg-[#65d8d0] text-[#062f3d] shadow-[0_8px_22px_rgba(0,0,0,.16)]"
                    : "bg-[#d4aa58] text-[#081c33] shadow-[0_8px_22px_rgba(0,0,0,.16)]"
                  : "text-white/68 hover:bg-white/[0.07] hover:text-white",
              )}
            >
              <Icon
                className="h-[19px] w-[19px]"
                strokeWidth={selected ? 2.2 : 1.7}
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.id === "today" && actionCount > 0 ? (
                <span
                  className={cn(
                    "inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                    selected
                      ? "bg-[#081c33] text-white"
                      : mermaid
                        ? "bg-[#65d8d0] text-[#062f3d]"
                        : "bg-[#d4aa58] text-[#081c33]",
                  )}
                  aria-label={`${actionCount} actions need attention`}
                >
                  {actionCount > 99 ? "99+" : actionCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={logout}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-white/60 hover:bg-white/[0.07] hover:text-white"
        >
          <LogOut className="h-[18px] w-[18px]" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "rental-v2 flex h-[100dvh] w-full overflow-hidden font-sans text-[#10243e]",
        mermaid ? "bg-[#f3f8f7]" : "bg-[#f5f2ec]",
      )}
    >
      <aside className="hidden w-[264px] shrink-0 md:block">{sidebar}</aside>

      {mobileOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu overlay"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-[#071728]/55 backdrop-blur-sm md:hidden"
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[292px] max-w-[86vw] shadow-2xl md:hidden">
            {sidebar}
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 flex min-h-[72px] shrink-0 items-center gap-3 border-b border-[#e5dfd5] bg-[#fbfaf7]/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-5 lg:px-7">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#ded8cd] bg-white text-[#42536a] md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          {showBack ? (
            <button
              type="button"
              onClick={navigateBack}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[#ded8cd] bg-white px-3 text-sm font-semibold text-[#31445d] shadow-[0_1px_2px_rgba(17,33,52,.04)] transition hover:border-[#c9b98f] hover:bg-[#fffdf8]"
              aria-label="Back to previous dashboard page"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-[-0.025em] text-[#0b213a] lg:text-[22px]">
              {title}
            </h1>
            {subtitle ? (
              <div className="mt-0.5 truncate text-xs text-[#626d79] sm:text-[13px]">
                {subtitle}
              </div>
            ) : null}
          </div>
          {typeof onSearchChange === "function" ? (
            <label className="hidden h-10 w-[min(34vw,360px)] items-center gap-2 rounded-xl border border-[#ded8cd] bg-white px-3 shadow-[0_1px_2px_rgba(17,33,52,.04)] md:flex">
              <Search className="h-4 w-4 text-[#7c8794]" />
              <span className="sr-only">{searchLabel}</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9aa2ab]"
              />
            </label>
          ) : null}
          {rightSlot}
        </header>

        {typeof onSearchChange === "function" ? (
          <div
            role="search"
            aria-label={searchLabel}
            className="border-b border-[#e5dfd5] bg-[#fbfaf7] px-3 pb-3 md:hidden"
          >
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#ded8cd] bg-white px-3">
              <Search className="h-4 w-4 text-[#7c8794]" />
              <span className="sr-only">{searchLabel}</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              />
            </label>
          </div>
        ) : null}

        <main
          ref={mainRef}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0"
        >
          {children}
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(66px+env(safe-area-inset-bottom))] grid-cols-5 border-t border-[#e5dfd5] bg-[#fbfaf7]/97 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          aria-label="Primary navigation"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const selected = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!selected) navigateTo(item.href);
                }}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-1 text-[9px] font-semibold",
                  selected
                    ? mermaid
                      ? "text-[#08777b]"
                      : "text-[#9b6f1a]"
                    : "text-[#626d79]",
                )}
              >
                <span className="relative">
                  <Icon
                    className="h-5 w-5"
                    strokeWidth={selected ? 2.3 : 1.7}
                  />
                  {item.id === "today" && actionCount > 0 ? (
                    <span
                      className="absolute -right-3 -top-2 inline-flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-4 text-white"
                      aria-label={`${actionCount} actions need attention`}
                    >
                      {actionCount > 9 ? "9+" : actionCount}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate px-1">
                  {item.id === "fleet"
                    ? "Fleet"
                    : item.id === "trip"
                      ? "Trip"
                      : item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
