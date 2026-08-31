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
      <div className="mx-auto w-full max-w-[1420px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <section className="overflow-hidden rounded-2xl border border-[#ded7ca] bg-white shadow-[0_14px_38px_rgba(24,37,52,.07)]">
          <div className="flex items-start justify-between gap-4 border-b border-[#ebe6dd] bg-[#fffdf8] px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9b6f1a]">
                  Priority inbox
                </p>
                {needsAction.length > 0 ? (
                  <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
                    {needsAction.length} waiting
                  </span>
                ) : null}
              </div>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0b213a] sm:text-2xl">
                {needsAction.length === 0
                  ? "No customer actions waiting"
                  : needsAction.length === 1
                    ? "1 customer needs you"
                    : `${needsAction.length} customers need you`}
              </h2>
              <p className="mt-1 text-sm text-[#6d7784]">
                Agent questions, human takeovers and workflow exceptions appear
                here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#ded8cd] bg-white text-[#536276] transition hover:bg-[#f8f5ef] disabled:opacity-60"
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
            <div className="space-y-3 bg-[#f8f5ef]/65 p-3 sm:p-4">
              {needsAction.map(({ lead, operation }) => {
                const needsReply =
                  operation.operatorAction === "answer_customer";
                return (
                  <article
                    key={lead.id}
                    className="grid gap-4 rounded-2xl border border-[#e2ddd3] bg-white p-4 shadow-[0_5px_18px_rgba(24,37,52,.045)] lg:grid-cols-[minmax(220px,.9fr)_minmax(280px,1.25fr)_minmax(190px,.7fr)_auto] lg:items-center lg:p-5"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                          needsReply
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-700",
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
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold",
                            needsReply
                              ? "bg-amber-50 text-amber-800"
                              : "bg-rose-50 text-rose-700",
                          )}
                        >
                          {needsReply ? "Agent needs help" : "Action required"}
                        </span>
                        <h3 className="mt-1 truncate text-base font-semibold text-[#10243e]">
                          {customerDisplayName(lead)}
                        </h3>
                        <p className="mt-0.5 truncate text-xs text-[#7a8490]">
                          {lead.channel || "WhatsApp"} ·{" "}
                          {activityAge(lead.updated_at)}
                        </p>
                      </div>
                    </div>

                    <div className="min-w-0 rounded-xl border border-[#eee7da] bg-[#fcfaf6] px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b7750]">
                        What needs your attention
                      </p>
                      <p className="mt-1 text-sm font-medium leading-5 text-[#31445d]">
                        {lead.next_action ||
                          operation.actionLabel ||
                          "Review this customer now."}
                      </p>
                    </div>

                    <div className="min-w-0 text-sm text-[#40526a]">
                      <span className="flex items-center gap-2 truncate font-medium">
                        <CarFront className="h-4 w-4 shrink-0 text-[#9b6f1a]" />
                        {lead.vehicle_preference || "Vehicle not selected"}
                      </span>
                      <span className="mt-1.5 block text-xs text-[#88909a]">
                        {dateValue(lead.pickup_datetime)} ·{" "}
                        {rentalStageLabel(operation.stage)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        navigate(rentalActionPath(lead, operation.actionTarget))
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b213a] px-4 text-sm font-semibold text-white shadow-[0_5px_14px_rgba(11,33,58,.18)] transition hover:bg-[#123354] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8862f]"
                    >
                      {needsReply ? "Open & respond" : operation.actionLabel}
                      <ArrowRight className="h-4 w-4" />
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
          className="grid grid-cols-2 gap-2.5 lg:grid-cols-4"
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
    gold: "bg-[#fff7e5] text-[#956a18] border-[#ecd9ac]",
    navy: "bg-[#eef3f8] text-[#1e456b] border-[#d8e1ea]",
    red: "bg-rose-50 text-rose-700 border-rose-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-h-24 rounded-2xl border border-[#e2ddd3] bg-white p-3 text-left shadow-[0_8px_26px_rgba(24,37,52,.045)] transition hover:-translate-y-0.5 hover:border-[#ccb77f] hover:shadow-[0_12px_30px_rgba(24,37,52,.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8862f] sm:p-4"
      aria-label={`${label}: ${value}. Open matching customers`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium leading-4 text-[#6d7784] sm:text-xs">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[#0b213a] sm:text-3xl">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition group-hover:scale-105 sm:h-11 sm:w-11",
            tones[tone],
          )}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
      </div>
    </button>
  );
}
