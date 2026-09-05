import type { FormEvent } from "react";
import {
  Accessibility,
  AlertCircle,
  CheckCircle2,
  Clock3,
  MessageCircleMore,
} from "lucide-react";
import { toast } from "sonner";
import { useDashboardIdentity } from "@/hooks/use-dashboard-identity";
import { useAcknowledgeMermaidCrewAssistance } from "@/hooks/use-mermaid-crew-assistance";
import type { MermaidCrewAssistance } from "@/lib/api";
import type { TaskUser } from "@/lib/tasks-api";
import {
  formatMermaidTripDate,
  mermaidConversationHref,
} from "@/lib/mermaid-operations";
import { cn } from "@/lib/utils";

const OPERATORS: TaskUser[] = ["Calvin", "Jr"];

export function MermaidCrewAssistanceBadge({
  item,
  compact = false,
}: {
  item: MermaidCrewAssistance;
  compact?: boolean;
}) {
  const awaiting = item.status === "unacknowledged";
  const label =
    item.kind === "wheelchair" ? "Wheelchair assistance" : "Boarding assistance";
  return (
    <span
      aria-label={`${label}${awaiting ? " — acknowledgement required" : ""}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-bold ring-1 ring-inset",
        awaiting
          ? "bg-amber-50 text-amber-900 ring-amber-300"
          : "bg-cyan-50 text-cyan-900 ring-cyan-200",
        compact
          ? "px-2 py-0.5 text-[10px] uppercase tracking-wide"
          : "px-3 py-1 text-[11px]",
      )}
    >
      <Accessibility className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {label}
      {awaiting ? <span className="h-1.5 w-1.5 rounded-full bg-amber-600" /> : null}
    </span>
  );
}

export function MermaidCrewAssistanceCard({
  item,
  customerName,
  conversationId,
  reservationPublicId,
  showLinks = false,
  className,
}: {
  item: MermaidCrewAssistance;
  customerName?: string;
  conversationId?: string;
  reservationPublicId?: string | null;
  showLinks?: boolean;
  className?: string;
}) {
  const { identity, setIdentity } = useDashboardIdentity();
  const acknowledgement = useAcknowledgeMermaidCrewAssistance();
  const awaiting = item.status === "unacknowledged";
  const label =
    item.kind === "wheelchair" ? "Wheelchair assistance" : "Boarding assistance";
  const effectiveReservationId =
    reservationPublicId ?? item.reservationPublicId;

  const submitAcknowledgement = async (event: FormEvent) => {
    event.preventDefault();
    if (!awaiting || acknowledgement.isPending) return;
    acknowledgement.reset();
    try {
      await acknowledgement.mutateAsync({
        id: item.id,
        expectedRevision: item.revision,
        acknowledgedBy: identity,
      });
      toast.success(`${label} acknowledged`, {
        description: `Recorded for ${identity}. The booking note remains.`,
      });
    } catch {
      // The mutation error stays visible in the card. The item is deliberately
      // not hidden or optimistically acknowledged when persistence fails.
    }
  };

  return (
    <section
      aria-label={label}
      data-private-staff-note="crew-assistance"
      className={cn(
        "min-w-0 rounded-2xl border p-4 [overflow-wrap:anywhere] sm:p-5",
        awaiting
          ? "border-amber-300 bg-amber-50/70"
          : item.status === "acknowledged"
            ? "border-cyan-200 bg-cyan-50/60"
            : "border-slate-200 bg-slate-50",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            awaiting
              ? "bg-amber-100 text-amber-900"
              : "bg-cyan-100 text-cyan-900",
          )}
        >
          <Accessibility className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">
              {label}
            </h3>
            {awaiting ? (
              <span className="rounded-full bg-amber-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                Crew acknowledgement needed
              </span>
            ) : item.status === "acknowledged" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                <CheckCircle2 className="h-3 w-3" /> Acknowledged
              </span>
            ) : (
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                No longer active
              </span>
            )}
          </div>
          {customerName ? (
            <p className="mt-1 font-semibold text-slate-900">{customerName}</p>
          ) : null}
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
            {item.note}
          </p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Guest / party
              </dt>
              <dd className="mt-0.5 text-slate-800">
                {item.relationship || "Guest in this party"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Trip
              </dt>
              <dd className="mt-0.5 text-slate-800">
                {item.tripDate
                  ? formatMermaidTripDate(item.tripDate)
                  : "Date not confirmed yet"}
              </dd>
            </div>
          </dl>
          {item.status === "acknowledged" ? (
            <p role="status" className="mt-3 flex items-center gap-2 text-sm text-cyan-950">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Acknowledged by {item.acknowledgedBy} ·{" "}
              {formatAcknowledgedAt(item.acknowledgedAt)}
            </p>
          ) : item.status === "withdrawn" ? (
            <p className="mt-3 text-sm text-slate-600">
              The current request was withdrawn. The note remains in the staff
              record for context.
            </p>
          ) : null}
        </div>
      </div>

      {awaiting ? (
        <form
          onSubmit={(event) => void submitAcknowledgement(event)}
          className="mt-4 flex flex-col gap-3 border-t border-amber-200 pt-4 sm:flex-row sm:items-end"
        >
          <label className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-amber-950">
            Operator acknowledging
            <select
              aria-label={`Operator acknowledging ${label.toLowerCase()}`}
              value={identity}
              onChange={(event) =>
                setIdentity(event.target.value as TaskUser)
              }
              disabled={acknowledgement.isPending}
              className="mt-1 block min-h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60"
            >
              {OPERATORS.map((operator) => (
                <option key={operator} value={operator}>
                  {operator}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={acknowledgement.isPending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#073b49] px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-wait disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            {acknowledgement.isPending ? "Recording…" : "Acknowledge"}
          </button>
        </form>
      ) : null}

      {acknowledgement.isError ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm leading-5 text-rose-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Acknowledgement was not recorded. This item still needs attention.
          Refresh and try again.
        </p>
      ) : null}

      {showLinks ? (
        <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-200/80 pt-3 text-sm font-semibold text-teal-900">
          {conversationId ? (
            <a
              href={mermaidConversationHref(conversationId)}
              className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4"
            >
              <MessageCircleMore className="h-4 w-4" /> Full conversation
            </a>
          ) : null}
          {effectiveReservationId ? (
            <a
              href={`/reservations/${encodeURIComponent(effectiveReservationId)}`}
              className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4"
            >
              <Clock3 className="h-4 w-4" /> Reservation
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function formatAcknowledgedAt(value: string | null): string {
  if (!value) return "time not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Curacao",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
