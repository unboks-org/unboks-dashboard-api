import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  FileText,
  MessageCircleMore,
  ShieldCheck,
} from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import {
  fetchMermaidReservation,
  type MermaidReservationStage,
} from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const stages: Array<{
  id: Exclude<MermaidReservationStage, "cancelled">;
  label: string;
}> = [
  { id: "details", label: "Details" },
  { id: "quote", label: "Quote" },
  { id: "payment", label: "Payment" },
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
  return (
    <DashboardShell
      activeNav="customers"
      pageTitle={item?.customerName ?? "Reservation"}
      pageSubtitle={
        item
          ? `${item.tripDate} · ${item.currency} ${item.total.toFixed(2)}`
          : "Loading Mermaid reservation"
      }
      hideRefresh
    >
      <div className="mx-auto w-full max-w-[1380px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
          <b>DEMO ONLY.</b> Availability and payment are simulated; no real
          money was received.
        </div>
        {!item ? (
          <div className="rounded-2xl border bg-white p-12 text-center text-sm text-slate-500">
            {query.isError
              ? "Reservation could not be loaded."
              : "Loading reservation…"}
          </div>
        ) : (
          <>
            <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid grid-cols-4 gap-2">
                {stages.map((stage, index) => (
                  <div key={stage.id} className="text-center">
                    <div
                      className={cn(
                        "mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold",
                        index <= currentIndex
                          ? "border-teal-700 bg-teal-700 text-white"
                          : "border-slate-300 bg-white text-slate-400",
                      )}
                    >
                      {index < currentIndex ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-700">
                      {stage.label}
                    </p>
                  </div>
                ))}
              </div>
            </section>
            <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
              <div className="space-y-5">
                <Card title="Reservation details">
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <Datum label="Guest" value={item.customerName} />
                    <Datum label="Trip date" value={item.tripDate} />
                    <Datum
                      label="Guests"
                      value={`${item.adults} adults · ${item.children} children 4-12 · ${item.infants} children 0-3`}
                    />
                    <Datum
                      label="Transport"
                      value={
                        item.pickupPreference === "pier"
                          ? "Fishermen’s Pier"
                          : `Pickup requested · ${item.pickupLocation || "location pending"}`
                      }
                    />
                    <Datum
                      label="Language"
                      value={item.language.toUpperCase()}
                    />
                    <Datum
                      label="Catalog snapshot"
                      value={item.catalogVersion}
                    />
                  </dl>
                </Card>
                <Card title="Conversation">
                  <div className="space-y-3">
                    {item.conversation.map((message, index) => (
                      <div
                        key={`${message.created_at}-${index}`}
                        className={cn(
                          "max-w-[88%] rounded-2xl px-4 py-3 text-sm",
                          message.role === "user"
                            ? "bg-slate-100 text-slate-800"
                            : "ml-auto bg-teal-700 text-white",
                        )}
                      >
                        <p>{message.text}</p>
                        <p className="mt-1 text-[10px] opacity-65">
                          {message.created_at}
                        </p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => navigate("/conversations")}
                    className="mt-4 flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
                  >
                    <MessageCircleMore className="h-4 w-4" /> Open conversation
                  </button>
                </Card>
              </div>
              <div className="space-y-5">
                <Card title="Quote and payment">
                  <p className="text-3xl font-semibold text-slate-950">
                    {item.currency} {item.total.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-rose-600">
                    Simulated payment only
                  </p>
                  <div className="mt-4 space-y-2">
                    {item.items.map((line) => (
                      <div
                        key={line.key}
                        className="flex justify-between text-sm"
                      >
                        <span>
                          {line.quantity} × {line.label}
                        </span>
                        <b>
                          {item.currency} {line.line_total.toFixed(2)}
                        </b>
                      </div>
                    ))}
                  </div>
                  {item.bookingCode ? (
                    <div className="mt-5 rounded-xl bg-emerald-50 p-4">
                      <p className="text-xs font-bold uppercase text-emerald-700">
                        Booking code
                      </p>
                      <p className="mt-1 font-mono text-lg font-bold text-emerald-950">
                        {item.bookingCode}
                      </p>
                    </div>
                  ) : null}
                </Card>
                <Card title="Documents">
                  {item.documents.map((doc) => (
                    <div
                      key={doc.public_id}
                      className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200 p-3"
                    >
                      <FileText className="h-5 w-5 text-teal-700" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {doc.filename}
                        </p>
                        <p className="text-xs text-slate-500">
                          {doc.kind} · {doc.delivery_status || "pending"}
                        </p>
                      </div>
                    </div>
                  ))}
                </Card>
                <Card title="Audit timeline">
                  {item.events.map((event) => (
                    <div
                      key={event.id}
                      className="relative border-l-2 border-teal-200 pb-4 pl-4 last:pb-0"
                    >
                      <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-teal-700" />
                      <p className="text-sm font-semibold text-slate-900">
                        {event.toState || event.type}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.reason}
                      </p>
                    </div>
                  ))}
                </Card>
                {item.primaryAction ? (
                  <button
                    onClick={() => navigate(item.primaryAction!.href)}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white"
                  >
                    {item.primaryAction.label}{" "}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-950">
        <ShieldCheck className="h-4 w-4 text-teal-700" />
        {title}
      </h2>
      {children}
    </section>
  );
}
function Datum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}
