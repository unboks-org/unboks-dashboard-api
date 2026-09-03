import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronRight,
  RefreshCw,
  ShipWheel,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import {
  fetchMermaidReservations,
  type MermaidReservationSummary,
} from "@/lib/api";
import {
  formatMermaidActivity,
  formatMermaidTripDate,
  mermaidGuestCount,
  MERMAID_STAGE_META,
} from "@/lib/mermaid-operations";
import { tenantKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type ReservationFilter = "all" | "active" | "crew" | "booked" | "cancelled";

const filters: Array<{ id: ReservationFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "In progress" },
  { id: "crew", label: "Needs crew" },
  { id: "booked", label: "Booked" },
  { id: "cancelled", label: "Cancelled" },
];

function isReservationFilter(value: string | null): value is ReservationFilter {
  return filters.some((filter) => filter.id === value);
}

function matchesFilter(
  reservation: MermaidReservationSummary,
  filter: ReservationFilter,
): boolean {
  if (filter === "active") {
    return reservation.stage !== "booked" && reservation.stage !== "cancelled";
  }
  if (filter === "crew") return reservation.humanTakeover;
  if (filter === "booked") return reservation.stage === "booked";
  if (filter === "cancelled") return reservation.stage === "cancelled";
  return true;
}

export default function MermaidReservations() {
  const [location, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const search = params.get("q") ?? "";
  const requestedFilter = params.get("stage");
  const activeFilter: ReservationFilter = isReservationFilter(requestedFilter)
    ? requestedFilter
    : "all";
  const query = useQuery({
    queryKey: tenantKey("mermaid-reservations", search),
    queryFn: () => fetchMermaidReservations(search),
    refetchInterval: 10_000,
    staleTime: 0,
  });
  const rows = query.data ?? [];
  const visibleRows = useMemo(
    () => rows.filter((row) => matchesFilter(row, activeFilter)),
    [rows, activeFilter],
  );
  const counts = useMemo(
    () => ({
      active: rows.filter((row) => matchesFilter(row, "active")).length,
      crew: rows.filter((row) => row.humanTakeover).length,
      booked: rows.filter((row) => row.stage === "booked").length,
      guests: rows.reduce((total, row) => total + mermaidGuestCount(row), 0),
    }),
    [rows],
  );

  const updateParams = (update: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchString);
    update(next);
    navigate(`${location}${next.size ? `?${next.toString()}` : ""}`, {
      replace: true,
    });
  };

  return (
    <DashboardShell
      activeNav="customers"
      pageTitle="Reservations"
      pageSubtitle="Every TRACY journey, from trip details to booked"
      searchQuery={search}
      onSearchChange={(value) =>
        updateParams((next) => {
          if (value) next.set("q", value);
          else next.delete("q");
        })
      }
      hideRefresh
    >
      <div className="mx-auto w-full max-w-[1480px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <section className="overflow-hidden rounded-[28px] border border-teal-100 bg-gradient-to-br from-white via-white to-cyan-50 shadow-[0_14px_40px_rgba(15,36,51,.05)]">
          <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between lg:p-8">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[.17em] text-teal-800 ring-1 ring-teal-100">
                <Sparkles className="h-3.5 w-3.5" /> Guest journey control
              </span>
              <h2 className="mt-4 text-2xl font-semibold tracking-[-.03em] text-slate-950">
                Reservation pipeline
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Search by guest, WhatsApp, quote or booking code. Values are
                calculated from the versioned catalog captured with each
                journey.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <PipelineStat
                label="In progress"
                value={query.data ? counts.active : "—"}
              />
              <PipelineStat
                label="Needs crew"
                value={query.data ? counts.crew : "—"}
                warn
              />
              <PipelineStat
                label="Booked"
                value={query.data ? counts.booked : "—"}
              />
              <PipelineStat
                label="Guests"
                value={query.data ? counts.guests : "—"}
              />
            </div>
          </div>
          <div className="border-t border-teal-100 bg-teal-50/55 px-5 py-3 text-xs leading-5 text-teal-950 sm:px-8">
            <b>Safe demo boundary:</b> availability and checkout are simulated;
            WhatsApp conversations and reservation progress are live operational
            data.
          </div>
        </section>

        <div
          className="flex gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label="Reservation filters"
        >
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={activeFilter === filter.id}
              onClick={() =>
                updateParams((next) => {
                  if (filter.id === "all") next.delete("stage");
                  else next.set("stage", filter.id);
                })
              }
              className={cn(
                "min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600",
                activeFilter === filter.id
                  ? "bg-[#073b49] text-white shadow-md"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-900",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {query.isLoading ? (
          <div className="rounded-[24px] border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            Loading reservation journeys…
          </div>
        ) : query.isError ? (
          <div className="rounded-[24px] border border-amber-200 bg-white p-8 text-center shadow-sm">
            <ShipWheel className="mx-auto h-8 w-8 text-teal-700" />
            <h2 className="mt-3 font-semibold text-slate-950">
              The reservation service is not available yet
            </h2>
            <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-slate-500">
              Open Conversations to check chat history. Structured reservation
              journeys will appear here when the TRACY reservation workflow is
              enabled.
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mx-auto mt-5 flex min-h-11 items-center gap-2 rounded-xl bg-[#073b49] px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-12 text-center">
            <ShipWheel className="mx-auto h-9 w-9 text-teal-700" />
            <h2 className="mt-3 text-lg font-semibold text-slate-900">
              No matching reservations
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              New WhatsApp reservation journeys appear here automatically.
            </p>
          </div>
        ) : (
          <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,36,51,.05)]">
            <div className="hidden grid-cols-[minmax(210px,1.1fr)_minmax(180px,.8fr)_minmax(180px,.75fr)_minmax(150px,.55fr)_36px] gap-4 border-b border-slate-100 bg-slate-50/70 px-6 py-3 text-[10px] font-bold uppercase tracking-[.15em] text-slate-500 md:grid">
              <span>Guest</span>
              <span>Trip</span>
              <span>Journey</span>
              <span>Value</span>
              <span />
            </div>
            <div className="divide-y divide-slate-100">
              {visibleRows.map((item) => {
                const stage = MERMAID_STAGE_META[item.stage];
                return (
                  <button
                    key={item.publicId}
                    type="button"
                    onClick={() =>
                      navigate(
                        `/reservations/${encodeURIComponent(item.publicId)}`,
                      )
                    }
                    className="group grid min-h-28 w-full gap-4 px-5 py-5 text-left transition hover:bg-[#f8fbfa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600 md:grid-cols-[minmax(210px,1.1fr)_minmax(180px,.8fr)_minmax(180px,.75fr)_minmax(150px,.55fr)_36px] md:items-center md:px-6"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold text-slate-950">
                          {item.customerName}
                        </span>
                        {item.humanTakeover ? (
                          <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                            Crew
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">
                        Updated {formatMermaidActivity(item.updatedAt)}
                      </span>
                    </span>
                    <span>
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <CalendarDays className="h-4 w-4 text-teal-700" />
                        {formatMermaidTripDate(item.tripDate)}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <UsersRound className="h-3.5 w-3.5" />
                        {mermaidGuestCount(item)} guests ·{" "}
                        {item.pickupPreference === "pier" ? "Pier" : "Pickup"}
                      </span>
                    </span>
                    <span>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset",
                          stage.tone,
                        )}
                      >
                        {stage.label}
                      </span>
                      <span className="mt-1.5 block text-xs uppercase tracking-wide text-slate-500">
                        {item.language}
                      </span>
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-950">
                        {item.currency} {item.total.toFixed(2)}
                      </span>
                      <span className="mt-1 block text-[10px] font-bold uppercase tracking-[.1em] text-amber-700">
                        Simulated checkout
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-teal-700" />
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}

function PipelineStat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number | string;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white bg-white/85 px-3 py-3 text-center shadow-sm sm:min-w-[72px]">
      <p
        className={cn(
          "text-xl font-semibold",
          warn ? "text-rose-700" : "text-slate-950",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-tight text-slate-500">{label}</p>
    </div>
  );
}
