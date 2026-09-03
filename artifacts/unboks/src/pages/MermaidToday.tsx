import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MessageCircleMore,
  ShipWheel,
  Sparkles,
  UserRoundCheck,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { useConversations } from "@/hooks/use-client-api";
import {
  collectConversationHideKeys,
  useHiddenConversations,
} from "@/hooks/use-hidden-conversations";
import { useBlockedLookup } from "@/hooks/use-blocked-senders";
import { fetchMermaidReservations } from "@/lib/api";
import { mapApiConversation } from "@/lib/conversation-mapper";
import {
  formatMermaidTripDate,
  mermaidConversationHref,
  mermaidGuestCount,
  mermaidTodayKey,
  summarizeMermaidOperations,
} from "@/lib/mermaid-operations";
import { tenantKey } from "@/lib/query-keys";

interface PriorityItem {
  id: string;
  title: string;
  detail: string;
  meta: string;
  href: string;
  tone: "crew" | "unread";
}

export default function MermaidToday() {
  const [, navigate] = useLocation();
  const reservationsQuery = useQuery({
    queryKey: tenantKey("mermaid-reservations", ""),
    queryFn: () => fetchMermaidReservations(),
    refetchInterval: 10_000,
  });
  const conversationsQuery = useConversations();
  const { isHidden } = useHiddenConversations();
  const { isBlocked } = useBlockedLookup();
  const reservations = reservationsQuery.data ?? [];
  const conversations = useMemo(
    () =>
      (conversationsQuery.data ?? []).map(mapApiConversation).filter((row) => {
        const keys = collectConversationHideKeys(row);
        return !isHidden(keys) && !isBlocked(keys);
      }),
    [conversationsQuery.data, isHidden, isBlocked],
  );
  const summary = useMemo(
    () => summarizeMermaidOperations(reservations, conversations),
    [reservations, conversations],
  );
  const priorityItems = useMemo<PriorityItem[]>(() => {
    const claimed = new Set<string>();
    const reservationItems = reservations
      .filter((row) => row.humanTakeover)
      .map((row) => {
        claimed.add(row.conversationId);
        return {
          id: `reservation:${row.publicId}`,
          title: row.customerName,
          detail: "TRACY handed this guest to the crew",
          meta: `${formatMermaidTripDate(row.tripDate)} · ${mermaidGuestCount(row)} guests`,
          href: `/reservations/${encodeURIComponent(row.publicId)}`,
          tone: "crew" as const,
        };
      });
    const conversationItems = conversations
      .filter(
        (row) =>
          (row.unread || row.escalated) &&
          !claimed.has(row.conversationKey ?? row.id),
      )
      .sort((a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0))
      .map((row) => ({
        id: `conversation:${row.id}`,
        title: row.sender,
        detail: row.subject || row.preview || "New WhatsApp message",
        meta: `${row.unread ? "Unread" : "Escalated"} · ${row.timestamp || "recently"}`,
        href: mermaidConversationHref(row.conversationKey ?? row.id),
        tone: "unread" as const,
      }));
    return [...reservationItems, ...conversationItems].slice(0, 7);
  }, [reservations, conversations]);
  const upcoming = useMemo(
    () =>
      reservations
        .filter(
          (row) =>
            row.stage !== "cancelled" && row.tripDate >= mermaidTodayKey(),
        )
        .sort((a, b) => a.tripDate.localeCompare(b.tripDate))
        .slice(0, 5),
    [reservations],
  );

  return (
    <DashboardShell
      activeNav="today"
      pageTitle="Today"
      pageSubtitle="TRACY guest operations · Mermaid Boat Trips Curaçao"
      hideRefresh
    >
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <section className="relative order-1 overflow-hidden rounded-[30px] bg-[#062f3d] text-white shadow-[0_24px_60px_rgba(6,47,61,.18)]">
          <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="absolute -bottom-36 left-1/3 h-64 w-96 rounded-full bg-teal-300/10 blur-3xl" />
          <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[.16em] text-cyan-100">
                  <Sparkles className="h-3.5 w-3.5" /> TRACY command deck
                </span>
                <span className="inline-flex rounded-full bg-amber-300 px-3 py-1 text-[11px] font-bold uppercase tracking-[.12em] text-[#15343b]">
                  Reservations in demo mode
                </span>
              </div>
              <h2 className="mt-5 max-w-3xl text-2xl font-semibold leading-tight tracking-[-.035em] sm:text-4xl">
                Every guest. One clear next step.
              </h2>
              <p className="mt-3 hidden max-w-2xl text-sm leading-6 text-white/68 sm:block sm:text-base">
                TRACY handles the routine. Your crew handles the exceptions,
                from first WhatsApp to island day.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <HeroNumber
                value={
                  reservationsQuery.data ? summary.activeReservations : "—"
                }
                label="active journeys"
              />
              <HeroNumber
                value={conversationsQuery.data ? conversations.length : "—"}
                label="live conversations"
              />
            </div>
          </div>
          <div className="relative flex items-center gap-3 border-t border-white/10 px-6 py-3 text-xs text-white/70 sm:px-10">
            <Waves className="h-4 w-4 text-cyan-300" />
            {conversationsQuery.isError
              ? "Chat connection unavailable."
              : conversationsQuery.isLoading
                ? "Connecting to chat history."
                : "Chat history connected."}{" "}
            Availability and checkout remain simulated until production
            integrations are approved.
          </div>
        </section>

        <section className="order-3 grid grid-cols-2 gap-3 xl:order-2 xl:grid-cols-4">
          <Metric
            icon={UserRoundCheck}
            label="Crew decisions"
            value={reservationsQuery.data ? summary.needsCrew : "—"}
            helper="Explicit TRACY handovers"
            accent="coral"
          />
          <Metric
            icon={Clock3}
            label="Waiting on guests"
            value={reservationsQuery.data ? summary.awaitingGuest : "—"}
            helper="Details, quote or checkout"
            accent="amber"
          />
          <Metric
            icon={CheckCircle2}
            label="Booked guests"
            value={reservationsQuery.data ? summary.bookedGuests : "—"}
            helper={
              reservationsQuery.data
                ? `${summary.bookedReservations} completed ${summary.bookedReservations === 1 ? "reservation" : "reservations"}`
                : "Reservation data unavailable"
            }
            accent="teal"
          />
          <Metric
            icon={MessageCircleMore}
            label="Unread chats"
            value={conversationsQuery.data ? summary.unreadConversations : "—"}
            helper={
              conversationsQuery.data
                ? `${conversations.length} conversations in view`
                : "Chat data unavailable"
            }
            accent="blue"
          />
        </section>

        <div className="order-2 grid gap-6 xl:order-3 xl:grid-cols-[1.12fr_.88fr]">
          <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,36,51,.06)]">
            <SectionHeading
              eyebrow="Focus now"
              title="Guest attention queue"
              action="Open conversations"
              onAction={() => navigate("/conversations")}
            />
            <div className="divide-y divide-slate-100 px-3 pb-3 sm:px-5 sm:pb-5">
              {priorityItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.href)}
                  className="group flex min-h-20 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                      item.tone === "crew"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-cyan-50 text-cyan-800"
                    }`}
                  >
                    {item.tone === "crew" ? (
                      <UserRoundCheck className="h-5 w-5" />
                    ) : (
                      <MessageCircleMore className="h-5 w-5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-950">
                        {item.title}
                      </span>
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          item.tone === "crew" ? "bg-rose-500" : "bg-cyan-500"
                        }`}
                      />
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-slate-600">
                      {item.detail}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {item.meta}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-teal-700" />
                </button>
              ))}
              {!conversationsQuery.isLoading && priorityItems.length === 0 ? (
                <EmptyQueue
                  icon={CheckCircle2}
                  title={
                    conversationsQuery.isError || reservationsQuery.isError
                      ? "Queue status is incomplete"
                      : "The deck is clear"
                  }
                  body={
                    conversationsQuery.isError || reservationsQuery.isError
                      ? "A service is unavailable. Open conversations or retry before assuming no guest needs attention."
                      : "No unread chats or crew handovers need attention."
                  }
                />
              ) : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,36,51,.06)]">
            <SectionHeading
              eyebrow="Next sailings"
              title="Upcoming guest journeys"
              action="All reservations"
              onAction={() => navigate("/reservations")}
            />
            <div className="space-y-2 px-5 pb-5">
              {upcoming.map((item) => (
                <button
                  key={item.publicId}
                  type="button"
                  onClick={() =>
                    navigate(
                      `/reservations/${encodeURIComponent(item.publicId)}`,
                    )
                  }
                  className="flex min-h-[74px] w-full items-center gap-3 rounded-2xl border border-slate-100 bg-[#f8fbfa] px-3.5 py-3 text-left transition hover:border-teal-200 hover:bg-teal-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-white text-teal-800 shadow-sm ring-1 ring-slate-100">
                    <CalendarDays className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-950">
                      {item.customerName}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {formatMermaidTripDate(item.tripDate)} ·{" "}
                      {mermaidGuestCount(item)} guests
                    </span>
                  </span>
                  <span className="text-xs font-bold capitalize text-teal-800">
                    {item.stage}
                  </span>
                </button>
              ))}
              {!reservationsQuery.isLoading && upcoming.length === 0 ? (
                <EmptyQueue
                  icon={ShipWheel}
                  title="Ready for the first journey"
                  body={
                    reservationsQuery.isError
                      ? "WhatsApp remains live; structured reservations appear after the TRACY reservation service is enabled."
                      : "New TRACY reservation journeys will appear here automatically."
                  }
                />
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}

function HeroNumber({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.07] p-4 backdrop-blur-sm">
      <p className="text-3xl font-semibold tracking-[-.04em]">{value}</p>
      <p className="mt-1 text-xs text-white/70">{label}</p>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  helper,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  helper: string;
  accent: "coral" | "amber" | "teal" | "blue";
}) {
  const styles = {
    coral: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    teal: "bg-emerald-50 text-emerald-700",
    blue: "bg-cyan-50 text-cyan-800",
  };
  return (
    <article className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_8px_28px_rgba(15,36,51,.045)] sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-slate-500">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-.04em] text-slate-950">
            {value}
          </p>
        </div>
        <span
          className={`hidden shrink-0 rounded-2xl p-3 sm:block ${styles[accent]}`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-500">{helper}</p>
    </article>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-700">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-[-.02em] text-slate-950">
          {title}
        </h2>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-semibold text-teal-800 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        {action}
      </button>
    </div>
  );
}

function EmptyQueue({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
      <Icon className="h-6 w-6 text-teal-700" />
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{body}</p>
    </div>
  );
}
