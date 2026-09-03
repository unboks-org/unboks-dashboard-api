import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, RefreshCw, ShipWheel } from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import {
  fetchMermaidReservations,
  type MermaidReservationStage,
} from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const stageLabels: Record<MermaidReservationStage, string> = {
  details: "Details",
  quote: "Quote",
  payment: "Payment",
  booked: "Booked",
  cancelled: "Cancelled",
};

export default function MermaidReservations() {
  const [location, navigate] = useLocation();
  const searchString = useSearch();
  const search = new URLSearchParams(searchString).get("q") ?? "";
  const query = useQuery({
    queryKey: tenantKey("mermaid-reservations", search),
    queryFn: () => fetchMermaidReservations(search),
    refetchInterval: 10_000,
    staleTime: 0,
  });
  const rows = query.data ?? [];
  const updateSearch = (value: string) => {
    const params = new URLSearchParams(searchString);
    if (value) params.set("q", value);
    else params.delete("q");
    navigate(`${location}${params.size ? `?${params.toString()}` : ""}`, {
      replace: true,
    });
  };
  return (
    <DashboardShell
      activeNav="customers"
      pageTitle="Reservations"
      pageSubtitle="WhatsApp journey from trip details to demo-paid booking"
      searchQuery={search}
      onSearchChange={updateSearch}
      hideRefresh
    >
      <div className="mx-auto w-full max-w-[1420px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
          <b>Demo reservations.</b> Seat availability and payment are simulated.
          No real money or reminder messages are used.
        </div>
        {query.isLoading ? (
          <div className="rounded-2xl border bg-white p-12 text-center text-sm text-slate-500">
            Loading reservations…
          </div>
        ) : query.isError ? (
          <button
            onClick={() => void query.refetch()}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        ) : rows.length === 0 ? (
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
          <div className="grid gap-3">
            {rows.map((item) => (
              <button
                key={item.publicId}
                onClick={() =>
                  navigate(`/reservations/${encodeURIComponent(item.publicId)}`)
                }
                className="grid min-h-24 w-full gap-4 rounded-[20px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-px hover:border-teal-300 hover:shadow-md sm:grid-cols-[minmax(180px,1fr)_minmax(170px,.8fr)_minmax(190px,.8fr)_auto] sm:items-center sm:px-5"
              >
                <div>
                  <p className="font-semibold text-slate-950">
                    {item.customerName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.conversationId}
                  </p>
                </div>
                <div className="text-sm text-slate-700">
                  <p className="flex items-center gap-2 font-medium">
                    <CalendarDays className="h-4 w-4 text-teal-700" />{" "}
                    {item.tripDate}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.adults + item.children + item.infants} guests ·{" "}
                    {item.language.toUpperCase()}
                  </p>
                </div>
                <div>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-bold",
                      item.stage === "booked"
                        ? "bg-emerald-100 text-emerald-800"
                        : item.stage === "cancelled"
                          ? "bg-slate-200 text-slate-600"
                          : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {stageLabels[item.stage]}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {item.currency} {item.total.toFixed(2)}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">
                    Simulated payment
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </button>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
