import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ArrowRight } from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { MermaidAttentionQueue } from "@/components/mermaid/MermaidAttentionQueue";
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
  mermaidGuestCount,
  mermaidTodayKey,
  summarizeMermaidOperations,
} from "@/lib/mermaid-operations";
import { tenantKey } from "@/lib/query-keys";

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
  const summary = summarizeMermaidOperations(reservations, conversations);
  const upcoming = reservations
    .filter(
      (row) => row.stage !== "cancelled" && row.tripDate >= mermaidTodayKey(),
    )
    .sort((a, b) => a.tripDate.localeCompare(b.tripDate))
    .slice(0, 5);
  const reservationReady =
    Boolean(reservationsQuery.data) && !reservationsQuery.isError;
  const conversationReady =
    Boolean(conversationsQuery.data) && !conversationsQuery.isError;

  return (
    <DashboardShell
      activeNav="today"
      pageTitle="Today"
      pageSubtitle="TRACY guest operations · Mermaid Boat Trips Curaçao"
      hideRefresh
    >
      <div className="mx-auto min-w-0 w-full max-w-[1320px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>
            {conversationReady
              ? conversations.length +
                " conversations · " +
                summary.unreadConversations +
                " unread"
              : "Conversation status unavailable"}
          </p>
          <a
            href="/conversations"
            className="flex min-h-11 items-center gap-2 font-semibold text-teal-800"
          >
            All conversations <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <MermaidAttentionQueue />
        <section
          aria-label="Reservation overview"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          <Metric
            label="Active journeys"
            value={reservationReady ? summary.activeReservations : "—"}
          />
          <Metric
            label="Waiting on guests"
            value={reservationReady ? summary.awaitingGuest : "—"}
          />
          <Metric
            label="Booked guests"
            value={reservationReady ? summary.bookedGuests : "—"}
          />
        </section>
        <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">
              Upcoming guest journeys
            </h2>
            <a
              href="/reservations"
              className="flex min-h-11 items-center text-sm font-semibold text-teal-800"
            >
              All reservations
            </a>
          </div>
          <div className="space-y-2">
            {upcoming.map((item) => (
              <button
                key={item.publicId}
                type="button"
                onClick={() =>
                  navigate("/reservations/" + encodeURIComponent(item.publicId))
                }
                className="flex min-h-20 w-full items-center gap-3 rounded-2xl border border-slate-100 bg-[#f8fbfa] px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                <CalendarDays className="h-5 w-5 shrink-0 text-teal-800" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-950">
                    {item.customerName}
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">
                    {formatMermaidTripDate(item.tripDate)} ·{" "}
                    {mermaidGuestCount(item)} guests
                  </span>
                </span>
                <span className="text-sm font-semibold capitalize text-teal-800">
                  {item.stage}
                </span>
              </button>
            ))}
          </div>
          {!reservationsQuery.isLoading && upcoming.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
              {reservationsQuery.isError
                ? "Reservation data could not be loaded."
                : "Ready for the first journey"}
            </p>
          ) : null}
        </section>
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          Reservations are in demo mode: availability and checkout are
          simulated. Conversations and escalation replies are live. No reminder
          messages are sent.
        </p>
      </div>
    </DashboardShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
