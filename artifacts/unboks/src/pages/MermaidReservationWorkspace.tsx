import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  FileText,
  MapPin,
  MessageCircleMore,
  Printer,
  ShieldCheck,
  ShipWheel,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { MermaidReservationAttention } from "@/components/mermaid/MermaidAttentionQueue";
import {
  MermaidCrewAssistanceBadge,
  MermaidCrewAssistanceCard,
} from "@/components/mermaid/MermaidCrewAssistance";
import { useMermaidAttention } from "@/hooks/use-mermaid-attention";
import {
  canPrintMermaidReceipt,
  MermaidPrintReceipt,
} from "@/components/mermaid/MermaidPrintReceipt";
import {
  fetchMermaidReservation,
  type MermaidReservationDetail,
  type MermaidReservationStage,
} from "@/lib/api";
import {
  formatMermaidActivity,
  formatMermaidTripDate,
  mermaidConversationHref,
  mermaidGuestCount,
  MERMAID_STAGE_META,
} from "@/lib/mermaid-operations";
import { tenantKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const stages: Array<{
  id: Exclude<MermaidReservationStage, "cancelled">;
  label: string;
}> = [
  { id: "details", label: "Details" },
  { id: "quote", label: "Quote" },
  { id: "payment", label: "Checkout" },
  { id: "booked", label: "Booked" },
];

type MermaidJourneyEvent = MermaidReservationDetail["events"][number];

const journeyDateFormatter = new Intl.DateTimeFormat("en", {
  timeZone: "America/Curacao",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const journeyTimeFormatter = new Intl.DateTimeFormat("en", {
  timeZone: "America/Curacao",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function sortMermaidJourneyEvents(
  events: MermaidJourneyEvent[],
): MermaidJourneyEvent[] {
  return events
    .map((event, sourceIndex) => ({
      event,
      sourceIndex,
      timestamp: Date.parse(event.createdAt),
    }))
    .sort((left, right) => {
      const leftHasTime = Number.isFinite(left.timestamp);
      const rightHasTime = Number.isFinite(right.timestamp);
      if (leftHasTime && rightHasTime && left.timestamp !== right.timestamp) {
        return left.timestamp - right.timestamp;
      }
      if (leftHasTime !== rightHasTime) return leftHasTime ? -1 : 1;
      if (left.event.revision !== right.event.revision) {
        return left.event.revision - right.event.revision;
      }
      if (left.event.id !== right.event.id) {
        return left.event.id - right.event.id;
      }
      return left.sourceIndex - right.sourceIndex;
    })
    .map(({ event }) => event);
}

export default function MermaidReservationWorkspace() {
  const { reservationId = "" } = useParams<{ reservationId: string }>();
  const [, navigate] = useLocation();
  const publicId = decodeURIComponent(reservationId);
  const query = useQuery({
    queryKey: tenantKey("mermaid-reservation", publicId),
    queryFn: () => fetchMermaidReservation(publicId),
    enabled: Boolean(publicId),
    refetchInterval: 10_000,
  });
  const item = query.data;
  const journeyEvents = item ? sortMermaidJourneyEvents(item.events) : [];
  const attention = useMermaidAttention();
  const needsAttention = attention.complete
    ? attention.items.some(
        (entry) =>
          entry.conversationId === item?.conversationId ||
          entry.reservation?.conversationId === item?.conversationId,
      )
    : Boolean(item?.humanTakeover);
  const receiptAction = item?.primaryAction?.id === "view_receipt";
  const currentIndex = item
    ? stages.findIndex((stage) => stage.id === item.stage)
    : -1;
  const openConversation = () => {
    if (item) navigate(mermaidConversationHref(item.conversationId));
  };

  return (
    <DashboardShell
      activeNav="customers"
      pageTitle={item?.customerName ?? "Reservation"}
      pageSubtitle={
        item
          ? `${formatMermaidTripDate(item.tripDate)} · ${mermaidGuestCount(item)} guests`
          : "Loading Mermaid guest journey"
      }
      hideRefresh
    >
      <div className="mx-auto min-w-0 w-full max-w-[1440px] space-y-5 px-4 py-5 [overflow-wrap:anywhere] sm:px-6 lg:px-8 lg:py-8">
        {!item ? (
          <div className="rounded-[26px] border border-slate-200 bg-white p-12 text-center shadow-sm">
            <ShipWheel className="mx-auto h-8 w-8 text-teal-700" />
            <p className="mt-3 text-sm text-slate-600">
              {query.isError
                ? "This reservation could not be loaded."
                : "Loading guest journey…"}
            </p>
            {query.isError ? (
              <button
                type="button"
                onClick={() => navigate("/reservations")}
                className="mx-auto mt-5 flex min-h-11 items-center gap-2 rounded-xl bg-[#073b49] px-4 text-sm font-semibold text-white"
              >
                <ArrowLeft className="h-4 w-4" /> Back to reservations
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <MermaidPrintReceipt item={item} />
            <section className="relative overflow-hidden rounded-[28px] bg-[#073b49] text-white shadow-[0_20px_55px_rgba(7,59,73,.18)]">
              <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-cyan-300/15 blur-3xl" />
              <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold ring-1 ring-inset",
                        MERMAID_STAGE_META[item.stage].tone,
                      )}
                    >
                      {MERMAID_STAGE_META[item.stage].label}
                    </span>
                    {item.crewAssistance ? (
                      <MermaidCrewAssistanceBadge item={item.crewAssistance} />
                    ) : null}
                    {needsAttention ? (
                      <span className="rounded-full bg-rose-600 px-3 py-1 text-[11px] font-bold text-white">
                        Crew attention required
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-cyan-100">
                        <Sparkles className="h-3 w-3" />{" "}
                        {attention.complete
                          ? "No open crew decision"
                          : "Checking crew attention"}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-5 text-3xl font-semibold tracking-[-.035em]">
                    {item.customerName}
                  </h2>
                  <p className="mt-2 text-sm text-white/60">
                    Journey {item.publicId} · updated{" "}
                    {formatMermaidActivity(item.updatedAt)}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <JourneyFact
                    icon={CalendarDays}
                    label="Trip"
                    value={formatMermaidTripDate(item.tripDate)}
                  />
                  <JourneyFact
                    icon={UsersRound}
                    label="Party"
                    value={`${mermaidGuestCount(item)} guests`}
                  />
                  <JourneyFact
                    icon={MapPin}
                    label="Arrival"
                    value={item.pickupPreference === "pier" ? "Pier" : "Pickup"}
                  />
                </div>
              </div>
              <div className="relative border-t border-white/10 px-6 py-3 text-xs text-white/70 sm:px-8">
                Demo reservation · assumed availability · simulated checkout ·
                no reminder messages
              </div>
            </section>

            {item.crewAssistance ? (
              <MermaidCrewAssistanceCard
                item={item.crewAssistance}
                customerName={item.customerName}
                conversationId={item.conversationId}
                reservationPublicId={item.publicId}
                showLinks
              />
            ) : null}

            <MermaidReservationAttention conversationId={item.conversationId} />

            <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-7">
              {item.stage === "cancelled" ? (
                <div className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-600">
                  This journey was cancelled. Its history remains available
                  below.
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {stages.map((stage, index) => (
                    <div key={stage.id} className="relative text-center">
                      {index > 0 ? (
                        <span
                          className={cn(
                            "absolute right-1/2 top-[18px] h-0.5 w-full",
                            index <= currentIndex
                              ? "bg-teal-600"
                              : "bg-slate-200",
                          )}
                        />
                      ) : null}
                      <div
                        className={cn(
                          "relative z-10 mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold",
                          index <= currentIndex
                            ? "border-teal-700 bg-teal-700 text-white"
                            : "border-slate-300 bg-white text-slate-500",
                        )}
                      >
                        {index < currentIndex ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <p className="mt-2 text-[11px] font-semibold text-slate-600 sm:text-xs">
                        {stage.label}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.16fr)_minmax(0,.84fr)]">
              <div className="min-w-0 space-y-5">
                <Card
                  eyebrow="Guest profile"
                  title="Reservation details"
                  action={
                    item.customerId ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/customers/${item.customerId}`)
                        }
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-teal-100 bg-teal-50 px-3.5 text-xs font-bold text-teal-900 transition-colors hover:border-teal-200 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                      >
                        Open customer account
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : null
                  }
                >
                  <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                    <Datum label="Guest" value={item.customerName} />
                    <Datum
                      label="Language"
                      value={item.language.toUpperCase()}
                    />
                    <Datum
                      label="Party"
                      value={
                        item.partyDescription ||
                        `${item.adults} ${item.adults === 1 ? "adult" : "adults"} · ${item.children} ${item.children === 1 ? "child" : "children"} 4–12 · ${item.infants} age 0–3`
                      }
                    />
                    <Datum
                      label="Contact number"
                      value={item.contactPhone || "Not provided"}
                    />
                    <Datum
                      label="Transport"
                      value={
                        item.pickupPreference === "pier"
                          ? "Arriving at Fishermen’s Pier"
                          : `Pickup requested · ${item.pickupLocation || "location pending"}`
                      }
                    />
                    <Datum
                      label="Trip date"
                      value={formatMermaidTripDate(item.tripDate)}
                    />
                    <Datum
                      label="Catalog snapshot"
                      value={item.catalogVersion}
                    />
                  </dl>
                  {item.dietaryRequirements ||
                  item.accessibilityNotes ||
                  item.specialRequests ? (
                    <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5">
                      {item.dietaryRequirements ? (
                        <Note
                          label="Dietary"
                          value={item.dietaryRequirements}
                        />
                      ) : null}
                      {item.accessibilityNotes &&
                      item.accessibilityNotes.trim() !==
                        item.crewAssistance?.note.trim() ? (
                        <Note
                          label="Accessibility"
                          value={item.accessibilityNotes}
                        />
                      ) : null}
                      {item.specialRequests ? (
                        <Note
                          label="Special request"
                          value={item.specialRequests}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </Card>

                <Card eyebrow="Context" title="Conversation snapshot">
                  <div className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
                    {item.conversation.map((message, index) => (
                      <div
                        key={`${message.created_at}-${index}`}
                        className={cn(
                          "max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6",
                          message.role === "user"
                            ? "bg-slate-100 text-slate-800"
                            : "ml-auto bg-[#0b6370] text-white",
                        )}
                      >
                        <p className="whitespace-pre-wrap">{message.text}</p>
                        <p className="mt-1 text-[10px] opacity-80">
                          {formatMermaidActivity(message.created_at)}
                        </p>
                      </div>
                    ))}
                    {item.conversation.length === 0 ? (
                      <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">
                        No messages are attached to this journey yet.
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={openConversation}
                    className="mt-5 flex min-h-11 items-center gap-2 rounded-xl bg-[#073b49] px-4 text-sm font-semibold text-white transition hover:bg-[#0a4b5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  >
                    <MessageCircleMore className="h-4 w-4" /> Open exact
                    conversation
                  </button>
                </Card>
              </div>

              <div className="min-w-0 space-y-5">
                <Card eyebrow="Commercial" title="Quote & checkout">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-3xl font-semibold tracking-[-.04em] text-slate-950">
                        {item.currency} {item.total.toFixed(2)}
                      </p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[.13em] text-amber-700">
                        Simulated checkout only
                      </p>
                    </div>
                    <ShieldCheck className="h-6 w-6 text-teal-700" />
                  </div>
                  <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
                    {item.items.map((line) => (
                      <div
                        key={line.key}
                        className="flex justify-between gap-4 py-3 text-sm"
                      >
                        <span className="text-slate-600">
                          {line.quantity} × {line.label}
                        </span>
                        <b className="text-slate-950">
                          {item.currency} {line.line_total.toFixed(2)}
                        </b>
                      </div>
                    ))}
                  </div>
                  {item.bookingCode ? (
                    <div className="mt-5 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
                      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-emerald-700">
                        Booking code
                      </p>
                      <p className="mt-1 font-mono text-lg font-bold text-emerald-950">
                        {item.bookingCode}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs leading-5 text-slate-500">
                      A booking code appears only after the demo checkout is
                      completed.
                    </p>
                  )}
                </Card>

                <Card eyebrow="Files" title="Guest documents">
                  <div className="space-y-2">
                    {item.documents.map((doc) => (
                      <div
                        key={doc.public_id}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3"
                      >
                        <span className="rounded-xl bg-cyan-50 p-2 text-cyan-800">
                          <FileText className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {doc.filename}
                          </p>
                          <p className="mt-0.5 text-xs capitalize text-slate-500">
                            {doc.kind} · {doc.delivery_status || "pending"}
                          </p>
                        </div>
                      </div>
                    ))}
                    {item.documents.length === 0 ? (
                      <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">
                        Quote and receipt PDFs appear here when generated.
                      </p>
                    ) : null}
                  </div>
                </Card>

                {item.primaryAction ? (
                  <button
                    type="button"
                    disabled={receiptAction && !canPrintMermaidReceipt(item)}
                    title={
                      receiptAction && !canPrintMermaidReceipt(item)
                        ? "The receipt will be printable once its booking and receipt references are available."
                        : undefined
                    }
                    onClick={() =>
                      receiptAction
                        ? window.print()
                        : item.primaryAction?.id === "open_conversation"
                          ? openConversation()
                          : navigate(
                              item.primaryAction?.href ?? "/reservations",
                            )
                    }
                    className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#073b49] px-4 text-sm font-bold text-white shadow-[0_10px_25px_rgba(7,59,73,.2)] transition hover:-translate-y-px hover:bg-[#0a4b5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {receiptAction ? "Print receipt" : item.primaryAction.label}{" "}
                    {receiptAction ? (
                      <Printer className="h-4 w-4" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                  </button>
                ) : null}
                {item.stage === "booked" && !receiptAction ? (
                  <button
                    type="button"
                    disabled={!canPrintMermaidReceipt(item)}
                    title={
                      !canPrintMermaidReceipt(item)
                        ? "The receipt will be printable once its booking and receipt references are available."
                        : undefined
                    }
                    onClick={() => window.print()}
                    className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#073b49] px-4 text-sm font-bold text-white shadow-[0_10px_25px_rgba(7,59,73,.2)] transition hover:-translate-y-px hover:bg-[#0a4b5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    Print receipt <Printer className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <Card eyebrow="Forensic trail" title="Journey timeline">
              <div className="-mt-2 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5">
                <p className="max-w-2xl text-sm leading-6 text-slate-500">
                  Every reservation milestone in the order it happened, from
                  first contact to the latest change.
                </p>
                <span className="inline-flex rounded-full bg-teal-50 px-3 py-1.5 text-[11px] font-bold text-teal-800 ring-1 ring-inset ring-teal-100">
                  {journeyEvents.length} recorded{" "}
                  {journeyEvents.length === 1 ? "event" : "events"}
                </span>
              </div>

              {journeyEvents.length ? (
                <ol aria-label="Journey timeline" className="space-y-4">
                  {journeyEvents.map((event, index) => {
                    const isLatest = index === journeyEvents.length - 1;
                    const eventState = event.toState || event.type;
                    const previousState = index
                      ? journeyEvents[index - 1].toState ||
                        journeyEvents[index - 1].type
                      : null;
                    const isReservationUpdate =
                      event.type === "booking_updated" ||
                      (event.fromState && event.fromState === event.toState) ||
                      (previousState && previousState === eventState);
                    const label = isReservationUpdate
                      ? "Reservation updated"
                      : formatTimelineLabel(eventState);
                    return (
                      <li
                        key={event.id}
                        className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[9rem_2.75rem_minmax(0,1fr)] sm:gap-x-4"
                      >
                        <time
                          dateTime={event.createdAt}
                          className="hidden pt-2 text-right sm:block"
                        >
                          <span className="block text-xs font-semibold text-slate-800">
                            {formatJourneyDate(event.createdAt)}
                          </span>
                          <span className="mt-1 block text-[11px] text-slate-500">
                            {formatJourneyTime(event.createdAt)} AST
                          </span>
                        </time>

                        <div className="relative col-start-1 row-start-1 flex justify-center sm:col-start-2">
                          <span
                            className={cn(
                              "relative z-10 flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-bold shadow-sm",
                              isLatest
                                ? "border-teal-700 bg-teal-700 text-white ring-4 ring-teal-50"
                                : "border-teal-200 bg-white text-teal-800 ring-4 ring-white",
                            )}
                          >
                            {isLatest ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              String(index + 1).padStart(2, "0")
                            )}
                          </span>
                          {!isLatest ? (
                            <span className="absolute bottom-[-1rem] top-9 w-px bg-gradient-to-b from-teal-300 to-teal-100" />
                          ) : null}
                        </div>

                        <article
                          className={cn(
                            "col-start-2 row-start-1 min-w-0 rounded-[20px] border p-4 shadow-[0_8px_24px_rgba(15,36,51,.045)] sm:col-start-3 sm:p-5",
                            isLatest
                              ? "border-teal-200 bg-gradient-to-br from-teal-50/80 to-white"
                              : "border-slate-200 bg-gradient-to-br from-white to-slate-50/50",
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-slate-950 sm:text-[15px]">
                                  {label}
                                </h3>
                                {isLatest ? (
                                  <span className="rounded-full bg-teal-700 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-white">
                                    Latest
                                  </span>
                                ) : null}
                              </div>
                              <time
                                dateTime={event.createdAt}
                                className="mt-1 block text-[11px] font-medium text-slate-500 sm:hidden"
                              >
                                {formatJourneyDate(event.createdAt)} ·{" "}
                                {formatJourneyTime(event.createdAt)} AST
                              </time>
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500 ring-1 ring-inset ring-slate-200">
                              {formatMermaidActivity(event.createdAt)}
                            </span>
                          </div>

                          {event.fromState &&
                          event.toState &&
                          event.fromState !== event.toState ? (
                            <div className="mt-3 flex min-w-0 items-center gap-2 text-[10px] font-semibold text-slate-500">
                              <span className="min-w-0 truncate rounded-lg bg-slate-100 px-2 py-1">
                                {formatTimelineLabel(event.fromState)}
                              </span>
                              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                              <span className="min-w-0 truncate rounded-lg bg-teal-100 px-2 py-1 text-teal-900">
                                {formatTimelineLabel(event.toState)}
                              </span>
                            </div>
                          ) : null}

                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                            {event.reason}
                          </p>
                          <p className="mt-4 border-t border-slate-200/70 pt-3 text-[10px] font-bold uppercase tracking-[.12em] text-slate-500">
                            Recorded by {formatTimelineActor(event.actor)} ·
                            Revision {event.revision}
                          </p>
                        </article>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                  <ShieldCheck className="mx-auto h-6 w-6 text-teal-700" />
                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    No journey events recorded yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    New milestones will appear here in chronological order.
                  </p>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function formatTimelineLabel(value: string): string {
  const words = value.replaceAll("_", " ").trim().toLowerCase();
  return words
    ? words.charAt(0).toUpperCase() + words.slice(1)
    : "Journey update";
}

function formatTimelineActor(value: string): string {
  const actor = value.replaceAll("_", " ").trim();
  if (!actor) return "System";
  if (actor.toLowerCase() === "tracy") return "TRACY";
  return formatTimelineLabel(actor);
}

function journeyDate(createdAt: string): Date | null {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatJourneyDate(createdAt: string): string {
  const date = journeyDate(createdAt);
  return date ? journeyDateFormatter.format(date) : "Date unavailable";
}

function formatJourneyTime(createdAt: string): string {
  const date = journeyDate(createdAt);
  return date ? journeyTimeFormatter.format(date) : "Time unavailable";
}

function JourneyFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[.07] p-3 backdrop-blur-sm sm:min-w-[110px] sm:p-3.5">
      <Icon className="h-4 w-4 text-cyan-300" />
      <p className="mt-2 text-[10px] uppercase tracking-[.12em] text-white/70">
        {label}
      </p>
      <p className="mt-1 text-xs font-semibold text-white">{value}</p>
    </div>
  );
}

function Card({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_10px_35px_rgba(15,36,51,.045)] sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.17em] text-teal-700">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-.02em] text-slate-950">
            {title}
          </h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Datum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[.13em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm font-medium leading-5 text-slate-900">
        {value}
      </dd>
    </div>
  );
}

function Note({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-amber-50 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[.12em] text-amber-800">
        {label}
      </p>
      <p className="mt-1 text-sm leading-5 text-slate-700">{value}</p>
    </div>
  );
}
