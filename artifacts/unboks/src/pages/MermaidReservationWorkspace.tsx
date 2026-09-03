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
  ShieldCheck,
  ShipWheel,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import {
  fetchMermaidReservation,
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
      <div className="mx-auto w-full max-w-[1440px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
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
                    {item.humanTakeover ? (
                      <span className="rounded-full bg-rose-600 px-3 py-1 text-[11px] font-bold text-white">
                        Crew attention required
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-cyan-100">
                        <Sparkles className="h-3 w-3" /> TRACY handling
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

            <div className="grid gap-5 xl:grid-cols-[1.16fr_.84fr]">
              <div className="space-y-5">
                <Card eyebrow="Guest profile" title="Reservation details">
                  <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                    <Datum label="Guest" value={item.customerName} />
                    <Datum
                      label="Language"
                      value={item.language.toUpperCase()}
                    />
                    <Datum
                      label="Party"
                      value={`${item.adults} ${item.adults === 1 ? "adult" : "adults"} · ${item.children} ${item.children === 1 ? "child" : "children"} 4–12 · ${item.infants} age 0–3`}
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
                      {item.accessibilityNotes ? (
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
                        <p>{message.text}</p>
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

              <div className="space-y-5">
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
                    onClick={() =>
                      item.primaryAction?.id === "open_conversation"
                        ? openConversation()
                        : navigate(item.primaryAction?.href ?? "/reservations")
                    }
                    className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#073b49] px-4 text-sm font-bold text-white shadow-[0_10px_25px_rgba(7,59,73,.2)] transition hover:-translate-y-px hover:bg-[#0a4b5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  >
                    {item.primaryAction.label}{" "}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <Card eyebrow="Forensic trail" title="Journey timeline">
              <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-3">
                {item.events.map((event) => (
                  <div
                    key={event.id}
                    className="relative border-l-2 border-teal-100 pb-6 pl-5 pr-4 last:pb-0"
                  >
                    <span className="absolute -left-[6px] top-1 h-2.5 w-2.5 rounded-full bg-teal-700 ring-4 ring-teal-50" />
                    <p className="text-sm font-semibold capitalize text-slate-900">
                      {(event.toState || event.type).replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {event.reason}
                    </p>
                    <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">
                      {event.actor} · {formatMermaidActivity(event.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  );
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
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_10px_35px_rgba(15,36,51,.045)] sm:p-6">
      <p className="text-[10px] font-bold uppercase tracking-[.17em] text-teal-700">
        {eyebrow}
      </p>
      <h2 className="mb-5 mt-1 text-lg font-semibold tracking-[-.02em] text-slate-950">
        {title}
      </h2>
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
