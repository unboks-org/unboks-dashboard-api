import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { ChevronRight, UsersRound } from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { fetchMermaidCustomers } from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";
import { formatMermaidActivity } from "@/lib/mermaid-operations";

export default function MermaidCustomers() {
  const [, navigate] = useLocation();
  const search = new URLSearchParams(useSearch()).get("q") ?? "";
  const query = useInfiniteQuery({
    queryKey: tenantKey("mermaid-customers", search),
    queryFn: ({ pageParam }) => fetchMermaidCustomers(search, pageParam),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    refetchInterval: 10_000,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <DashboardShell
      activeNav="customers"
      pageTitle="Customers"
      pageSubtitle="Every guest, with their details and history in one place"
      searchQuery={search}
      onSearchChange={(value) =>
        navigate(
          `/customers${value ? `?q=${encodeURIComponent(value)}` : ""}`,
          { replace: true },
        )
      }
      hideRefresh
    >
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm leading-6 text-slate-600">
            Tracy saves each enquiry here as it arrives. Open a guest to see
            their contact details, trip plans, bookings and conversations.
          </p>
          <Link
            href="/reservations"
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-teal-900"
          >
            View reservations
          </Link>
        </div>
        {query.isError ? (
          <div role="alert" className="rounded-2xl bg-white p-6">
            Customer accounts could not be loaded.{" "}
            <button onClick={() => void query.refetch()} className="underline">
              Try again
            </button>
          </div>
        ) : query.isPending ? (
          <p className="p-8 text-slate-500">Loading customers…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <UsersRound className="mx-auto mb-3 h-8 w-8 text-teal-700" />
            <h2 className="font-semibold">
              {search
                ? "No matching customers"
                : "Your customers will appear here"}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Enquiries are saved from the first message, before a booking is
              made.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            {rows.map((customer) => (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="group flex items-center gap-4 px-5 py-6 hover:bg-teal-50/40 focus-visible:outline-teal-700"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 font-semibold text-teal-800">
                  {(customer.customerName || "G").slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold text-slate-950">
                    {customer.customerName || "New guest"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {customer.details.contact_phone || "Contact number pending"}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {customer.reservationCount
                      ? `${customer.reservationCount} reservation${customer.reservationCount === 1 ? "" : "s"}`
                      : "Enquiry · no booking yet"}{" "}
                    · {customer.messageCount} messages
                  </p>
                </div>
                <span className="hidden text-xs text-slate-500 sm:block">
                  Updated {formatMermaidActivity(customer.lastSeen)}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-teal-700" />
              </Link>
            ))}
          </div>
        )}
        {query.hasNextPage ? (
          <button
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
            className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-teal-900"
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more customers"}
          </button>
        ) : null}
      </div>
    </DashboardShell>
  );
}
