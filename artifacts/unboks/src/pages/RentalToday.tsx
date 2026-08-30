import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  UserRoundCheck,
} from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { fetchQuoteLeads } from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";
import {
  customerDisplayName,
  customerWorkspacePath,
  projectRentalLead,
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
    .filter(
      ({ operation }) =>
        operation.responsibleParty === "Staff" && !operation.isClosed,
    )
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
      pageSubtitle="Your rental operation at a glance"
      hideRefresh
    >
      <div className="mx-auto w-full max-w-[1420px] space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <section
          className="grid grid-cols-2 gap-2.5 xl:grid-cols-4"
          aria-label="Operational summary"
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

        <section className="overflow-hidden rounded-2xl border border-[#e2ddd3] bg-white shadow-[0_12px_34px_rgba(24,37,52,.06)]">
          <div className="flex items-start justify-between gap-4 border-b border-[#ebe6dd] px-5 py-5 sm:px-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9b6f1a]">
                Action queue
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#0b213a]">
                What needs attention now
              </h2>
              <p className="mt-1 text-sm text-[#6d7784]">
                Only work owned by staff appears here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#ded8cd] text-[#536276] hover:bg-[#f8f5ef] disabled:opacity-60"
              aria-label="Refresh action queue"
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
              Loading today’s work…
            </div>
          ) : needsAction.length ? (
            <div className="divide-y divide-[#eee9e1]">
              {needsAction.map(({ lead, operation }) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => navigate(customerWorkspacePath(lead))}
                  className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[#fbf9f4] sm:grid-cols-[minmax(0,1.2fr)_minmax(150px,.7fr)_minmax(150px,.7fr)_auto] sm:items-center sm:px-6"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-[#10243e]">
                      {customerDisplayName(lead)}
                    </span>
                    <span className="mt-1 block truncate text-xs text-[#77818d]">
                      {lead.phone_normalized || lead.phone_raw || "No phone"}
                    </span>
                  </span>
                  <span className="min-w-0 text-sm text-[#40526a]">
                    <span className="block truncate font-medium">
                      {lead.vehicle_preference || "Vehicle not selected"}
                    </span>
                    <span className="mt-1 block text-xs text-[#88909a]">
                      {dateValue(lead.pickup_datetime)}
                    </span>
                  </span>
                  <span>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                        operation.exception
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-[#ead8af] bg-[#fff8e8] text-[#805b17]",
                      )}
                    >
                      {rentalStageLabel(operation.stage)}
                    </span>
                    <span className="mt-1.5 block text-xs text-[#7a8490]">
                      {lead.next_action || "Review customer file"}
                    </span>
                  </span>
                  <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#0b213a] px-4 text-sm font-semibold text-white">
                    {operation.actionLabel} <ArrowRight className="h-4 w-4" />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-6 py-14 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
              <p className="mt-3 font-semibold text-[#10243e]">
                You’re caught up
              </p>
              <p className="mt-1 text-sm text-[#6d7784]">
                There are no staff-owned actions right now.
              </p>
            </div>
          )}
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
      className="group min-h-28 rounded-2xl border border-[#e2ddd3] bg-white p-3 text-left shadow-[0_8px_26px_rgba(24,37,52,.045)] transition hover:-translate-y-0.5 hover:border-[#ccb77f] hover:shadow-[0_12px_30px_rgba(24,37,52,.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8862f] sm:min-h-0 sm:p-4"
      aria-label={`${label}: ${value}. Open matching customers`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium leading-4 text-[#6d7784] sm:text-xs">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[#0b213a] sm:mt-2 sm:text-3xl">
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
