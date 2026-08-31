import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CarFront,
  CheckCircle2,
  Clock3,
  MessageCircleMore,
  RefreshCw,
  UserRoundCheck,
} from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { fetchQuoteLeads } from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";
import {
  customerDisplayName,
  projectRentalLead,
  rentalActionPath,
  rentalLeadNeedsStaffAction,
  rentalStageLabel,
} from "@/lib/rental-operations";
import { cn } from "@/lib/utils";

function dateValue(value: string | undefined): string {
  if (!value) return "Dates pending";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-CW", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(parsed);
}

function activityAge(value: string | undefined): string {
  if (!value) return "Activity time unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Recently updated";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - parsed.getTime()) / 60_000),
  );
  if (minutes < 2) return "Updated just now";
  if (minutes < 60) return `Waiting ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Waiting ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Waiting ${days}d`;
}

export default function RentalToday() {
  const [, navigate] = useLocation();
  const query = useQuery({
    queryKey: tenantKey("quote-leads"),
    queryFn: () => fetchQuoteLeads(),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const projected = useMemo(
    () =>
      (query.data || []).map((lead) => ({
        lead,
        operation: projectRentalLead(lead),
      })),
    [query.data],
  );
  const needsAction = projected
    .filter(({ lead }) => rentalLeadNeedsStaffAction(lead))
    .sort((a, b) => {
      const priority = b.operation.priority - a.operation.priority;
      if (priority) return priority;
      return (
        new Date(a.lead.updated_at).getTime() -
        new Date(b.lead.updated_at).getTime()
      );
    });
  const waitingCustomer = projected.filter(
    ({ operation }) =>
      operation.responsibleParty === "Customer" && !operation.isClosed,
  ).length;
  const technical = projected.filter(
    ({ operation }) => operation.exception && !operation.isClosed,
  ).length;
  const readyPickup = projected.filter(
    ({ operation }) => operation.stage === "confirmed",
  ).length;

  return (
    <DashboardShell
      activeNav="today"
      pageTitle="Today"
      pageSubtitle="See who needs help and act without hunting through the dashboard"
      hideRefresh
    >
      <div className="mx-auto w-full max-w-[1420px] space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <section className="overflow-hidden rounded-[26px] border border-[#ded7ca] bg-white shadow-[0_22px_55px_rgba(24,37,52,.075)]">
          <div className="relative flex items-start justify-between gap-5 overflow-hidden border-b border-[#e9e3d8] bg-[linear-gradient(115deg,#fffdf8_0%,#ffffff_56%,#faf5e9_100%)] px-5 py-6 sm:px-7 sm:py-7">
            <div
              className="absolute inset-y-0 left-0 w-1 bg-[#d4aa58]"
              aria-hidden="true"
            />
            <div className="min-w-0 pl-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9b6f1a] sm:text-xs">
                  Priority inbox
                </p>
                {needsAction.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-rose-500"
                      aria-hidden="true"
                    />
                    {needsAction.length} waiting
                  </span>
                ) : null}
              </div>
              <h2 className="mt-2 text-[1.35rem] font-semibold leading-tight tracking-[-0.035em] text-[#0b213a] sm:text-[1.7rem]">
                {needsAction.length === 0
                  ? "No customer actions waiting"
                  : needsAction.length === 1
                    ? "1 customer needs you"
                    : `${needsAction.length} customers need you`}
              </h2>
              <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-[#657181] sm:text-sm">
                Agent questions, human takeovers and workflow exceptions appear
                here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-[#ddd5c8] bg-white/90 text-[#536276] shadow-[0_4px_14px_rgba(24,37,52,.06)] transition hover:-translate-y-0.5 hover:border-[#c9b57d] hover:text-[#0b213a] hover:shadow-[0_8px_20px_rgba(24,37,52,.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8862f] disabled:opacity-60"
              aria-label="Refresh priority inbox"
            >
              <RefreshCw
                className={cn("h-4 w-4", query.isFetching && "animate-spin")}
              />
            </button>
          </div>

          {query.isError ? (
            <div className="px-6 py-14 text-center" role="alert">
              <AlertTriangle className="mx-auto h-8 w-8 text-rose-600" />
              <p className="mt-3 font-semibold text-[#10243e]">
                Today’s work could not be loaded
              </p>
              <p className="mt-1 text-sm text-[#6d7784]">
                No workflow decisions are shown until the server state is
                available.
              </p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0b213a] px-4 text-sm font-semibold text-white"
              >
                <RefreshCw className="h-4 w-4" /> Try again
              </button>
            </div>
          ) : query.isLoading ? (
            <div className="p-10 text-center text-sm text-[#6d7784]">
              Loading priority work…
            </div>
          ) : needsAction.length ? (
            <div className="space-y-3 bg-[#f7f4ee] p-3 sm:p-4">
              {needsAction.map(({ lead, operation }) => {
                const needsReply =
                  operation.operatorAction === "answer_customer";
                return (
                  <article
                    key={lead.id}
                    className="group relative grid gap-5 overflow-hidden rounded-[20px] border border-[#e0d9cd] bg-white p-4 shadow-[0_7px_22px_rgba(24,37,52,.045)] transition duration-200 hover:-translate-y-px hover:border-[#cdbb91] hover:shadow-[0_14px_30px_rgba(24,37,52,.08)] sm:p-5 lg:grid-cols-[minmax(210px,.9fr)_minmax(240px,1.15fr)_minmax(175px,.7fr)_150px] lg:items-center lg:gap-0 lg:px-6 lg:py-5"
                  >
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 w-[3px]",
                        needsReply ? "bg-[#d7aa50]" : "bg-rose-500",
                      )}
                      aria-hidden="true"
                    />
                    <div className="flex min-w-0 items-center gap-3 lg:pr-5">
                      <span
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border",
                          needsReply
                            ? "border-amber-200/80 bg-amber-50 text-amber-800"
                            : "border-rose-200/80 bg-rose-50 text-rose-700",
                        )}
                      >
                        {needsReply ? (
                          <MessageCircleMore className="h-5 w-5" />
                        ) : (
                          <AlertTriangle className="h-5 w-5" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.075em]",
                            needsReply ? "text-amber-800" : "text-rose-700",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              needsReply ? "bg-amber-500" : "bg-rose-500",
                            )}
                            aria-hidden="true"
                          />
                          {needsReply ? "Agent needs help" : "Action required"}
                        </span>
                        <h3 className="mt-1.5 truncate text-[15px] font-semibold tracking-[-0.015em] text-[#10243e] sm:text-base">
                          {customerDisplayName(lead)}
                        </h3>
                        <p className="mt-0.5 truncate text-xs font-medium text-[#7a8490]">
                          <span className="capitalize">
                            {lead.channel || "WhatsApp"}
                          </span>{" "}
                          <span className="px-1 text-[#c0b8aa]">·</span>{" "}
                          {activityAge(lead.updated_at)}
                        </p>
                      </div>
                    </div>

                    <div className="min-w-0 border-t border-[#eee8df] pt-4 lg:border-l lg:border-t-0 lg:px-5 lg:py-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#90794f]">
                        What needs your attention
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-5 text-[#2d415b]">
                        {lead.next_action ||
                          operation.actionLabel ||
                          "Review this customer now."}
                      </p>
                    </div>

                    <div className="min-w-0 border-t border-[#eee8df] pt-4 text-sm text-[#40526a] lg:border-l lg:border-t-0 lg:px-5 lg:py-1">
                      <span className="flex items-center gap-2 truncate font-semibold text-[#40526a]">
                        <CarFront
                          className="h-4 w-4 shrink-0 text-[#a57721]"
                          strokeWidth={1.8}
                        />
                        {lead.vehicle_preference || "Vehicle not selected"}
                      </span>
                      <span className="mt-1.5 block text-xs font-medium text-[#88909a]">
                        {dateValue(lead.pickup_datetime)} ·{" "}
                        {rentalStageLabel(operation.stage)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        navigate(rentalActionPath(lead, operation.actionTarget))
                      }
                      className="inline-flex min-h-12 w-full items-center justify-between gap-3 rounded-[14px] bg-[#0b213a] px-4 text-left text-[13px] font-semibold leading-4 text-white shadow-[0_8px_18px_rgba(11,33,58,.18)] transition hover:-translate-y-0.5 hover:bg-[#123354] hover:shadow-[0_12px_22px_rgba(11,33,58,.23)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8862f] lg:ml-5"
                    >
                      <span>
                        {needsReply ? "Open & respond" : operation.actionLabel}
                      </span>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 transition group-hover:bg-white/15">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
              <p className="mt-3 font-semibold text-[#10243e]">
                You’re caught up
              </p>
              <p className="mt-1 text-sm text-[#6d7784]">
                No customers need a staff decision or reply right now.
              </p>
            </div>
          )}
        </section>

        <section
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          aria-label="Operational overview"
        >
          <Metric
            icon={UserRoundCheck}
            label="Needs your action"
            value={needsAction.length}
            tone="gold"
            onClick={() => navigate("/customers?view=needs-action")}
          />
          <Metric
            icon={Clock3}
            label="Waiting on customer"
            value={waitingCustomer}
            tone="navy"
            onClick={() => navigate("/customers?view=waiting-customer")}
          />
          <Metric
            icon={AlertTriangle}
            label="Technical attention"
            value={technical}
            tone="red"
            onClick={() => navigate("/customers?view=technical")}
          />
          <Metric
            icon={CheckCircle2}
            label="Ready for pickup"
            value={readyPickup}
            tone="green"
            onClick={() => navigate("/customers?view=ready-pickup")}
          />
        </section>
      </div>
    </DashboardShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: typeof Clock3;
  label: string;
  value: number;
  tone: "gold" | "navy" | "red" | "green";
  onClick: () => void;
}) {
  const tones = {
    gold: "bg-[#fff8e8] text-[#956a18] border-[#ead4a2]",
    navy: "bg-[#eef4f9] text-[#1e456b] border-[#d4e0ea]",
    red: "bg-rose-50 text-rose-700 border-rose-200/90",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200/90",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-h-24 rounded-[20px] border border-[#e0d9ce] bg-[linear-gradient(145deg,#ffffff_0%,#fdfcf9_100%)] p-3.5 text-left shadow-[0_8px_26px_rgba(24,37,52,.045)] transition duration-200 hover:-translate-y-0.5 hover:border-[#cbb784] hover:shadow-[0_14px_30px_rgba(24,37,52,.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8862f] sm:p-5"
      aria-label={`${label}: ${value}. Open matching customers`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.065em] text-[#6d7784] sm:text-[11px]">
            {label}
          </p>
          <p className="mt-1.5 text-[1.7rem] font-semibold leading-none tracking-[-0.055em] text-[#0b213a] sm:text-[2rem]">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border shadow-[inset_0_1px_0_rgba(255,255,255,.8)] transition group-hover:scale-105 sm:h-11 sm:w-11",
            tones[tone],
          )}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
      </div>
    </button>
  );
}
