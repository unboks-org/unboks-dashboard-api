import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CarFront, Filter, RefreshCw } from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { fetchQuoteLeads } from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";
import {
  customerDisplayName,
  customerWorkspacePath,
  projectRentalLead,
  rentalStageLabel,
  type RentalStage,
} from "@/lib/rental-operations";
import { cn } from "@/lib/utils";

type FilterId = "all" | "prequote" | "postquote" | "confirmed" | "closed";

const filters: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "prequote", label: "Pre-quote" },
  { id: "postquote", label: "Post-quote" },
  { id: "confirmed", label: "Confirmed" },
  { id: "closed", label: "Closed" },
];

function stageMatches(stage: RentalStage, filter: FilterId): boolean {
  if (filter === "all") return stage !== "closed";
  if (filter === "prequote") return stage === "quote";
  if (filter === "postquote")
    return !["quote", "confirmed", "closed"].includes(stage);
  return stage === filter;
}

function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-CW", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}

export default function RentalCustomers() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const query = useQuery({
    queryKey: tenantKey("quote-leads"),
    queryFn: () => fetchQuoteLeads(),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data || [])
      .map((lead) => ({ lead, operation: projectRentalLead(lead) }))
      .filter(({ lead, operation }) => {
        if (!stageMatches(operation.stage, filter)) return false;
        if (!needle) return true;
        return [
          customerDisplayName(lead),
          lead.phone_raw,
          lead.phone_normalized,
          lead.quote_reference,
          lead.reservation_reference,
          lead.vehicle_preference,
        ].some((value) => (value || "").toLowerCase().includes(needle));
      });
  }, [filter, query.data, search]);

  return (
    <DashboardShell
      activeNav="customers"
      pageTitle="Customers"
      pageSubtitle="One file from first inquiry through pickup"
      searchQuery={search}
      onSearchChange={setSearch}
      hideRefresh
    >
      <div className="mx-auto w-full max-w-[1460px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <section
          className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-[#e2ddd3] bg-white p-2 shadow-[0_8px_24px_rgba(24,37,52,.04)]"
          aria-label="Customer filters"
        >
          <Filter className="ml-2 h-4 w-4 shrink-0 text-[#8b7750]" />
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
              className={cn(
                "min-h-10 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition",
                filter === item.id
                  ? "bg-[#0b213a] text-white"
                  : "text-[#617085] hover:bg-[#f7f4ed]",
              )}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e2ddd3] text-[#617085] hover:bg-[#f7f4ed]"
            aria-label="Refresh customers"
          >
            <RefreshCw
              className={cn("h-4 w-4", query.isFetching && "animate-spin")}
            />
          </button>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#e2ddd3] bg-white shadow-[0_12px_34px_rgba(24,37,52,.06)]">
          <div className="hidden grid-cols-[minmax(190px,1.15fr)_minmax(170px,.95fr)_minmax(170px,.9fr)_130px_150px_44px] gap-4 border-b border-[#e9e4db] bg-[#faf8f3] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#7d8793] lg:grid">
            <span>Customer</span>
            <span>Vehicle & dates</span>
            <span>Reference</span>
            <span>Stage</span>
            <span>Responsible</span>
            <span />
          </div>

          {query.isLoading ? (
            <div className="p-12 text-center text-sm text-[#6d7784]">
              Loading customers…
            </div>
          ) : rows.length ? (
            <div className="divide-y divide-[#eee9e1]">
              {rows.map(({ lead, operation }) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => navigate(customerWorkspacePath(lead))}
                  className="grid w-full gap-3 px-5 py-4 text-left hover:bg-[#fbf9f4] lg:grid-cols-[minmax(190px,1.15fr)_minmax(170px,.95fr)_minmax(170px,.9fr)_130px_150px_44px] lg:items-center lg:gap-4"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf1f5] text-xs font-bold text-[#274563]">
                      {customerDisplayName(lead)
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-[#10243e]">
                        {customerDisplayName(lead)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#7d8793]">
                        {lead.phone_normalized || lead.phone_raw || "No phone"}
                      </span>
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 truncate text-sm font-medium text-[#40526a]">
                      <CarFront className="h-4 w-4 shrink-0 text-[#9b6f1a]" />
                      {lead.vehicle_preference || "Not selected"}
                    </span>
                    <span className="mt-1 block text-xs text-[#8a929c]">
                      {formatDate(lead.pickup_datetime)} →{" "}
                      {formatDate(lead.return_datetime)}
                    </span>
                  </span>
                  <span className="truncate text-sm text-[#526177]">
                    {lead.reservation_reference ||
                      lead.quote_reference ||
                      "No reference yet"}
                  </span>
                  <span>
                    <span className="inline-flex rounded-full border border-[#ded8cd] bg-[#faf8f3] px-2.5 py-1 text-xs font-semibold text-[#536276]">
                      {rentalStageLabel(operation.stage)}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-[#40526a]">
                    {operation.responsibleParty}
                  </span>
                  <span className="hidden h-10 w-10 items-center justify-center rounded-xl border border-[#ded8cd] text-[#31445d] lg:flex">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-6 py-14 text-center text-sm text-[#6d7784]">
              No customers match this view.
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
