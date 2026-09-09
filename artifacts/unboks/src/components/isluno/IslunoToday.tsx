import { IslunoRecovery } from "./IslunoRecovery";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { useIslunoWorkspace } from "@/hooks/use-isluno-workspace";
import { fetchIslunoToday, money } from "@/lib/isluno-operations";
import { tenantKey } from "@/lib/query-keys";

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const link =
  "inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold text-teal-900";
export function IslunoTodayPage() {
  const workspace = useIslunoWorkspace();
  const query = useQuery({
    queryKey: tenantKey("isluno-today"),
    queryFn: fetchIslunoToday,
    enabled: workspace.enabled,
    retry: false,
    refetchInterval: 15_000,
  });
  const data = query.data;
  return (
    <DashboardShell
      activeNav="today"
      pageTitle="Today"
      pageSubtitle={workspace.brand?.name + " · Itinerary operations"}
      hideRefresh
    >
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <p className="rounded-2xl bg-amber-50 p-4 text-sm">
          Demo availability is assumed. Payment is simulated. No real charge or
          supplier reservation is made. Provider acceptance is not proof of
          guest delivery.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link className={link} href="/settings?category=trip-pricing">
            Products & pricing
          </Link>
          <Link className={link} href="/reservations">
            Itineraries
          </Link>
          <Link className={link} href="/today?view=mermaid">
            Legacy Mermaid operations
          </Link>
          <button
            className={link}
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            {query.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {query.isLoading && <p role="status">Loading journey status…</p>}
        {query.isError && (
          <p role="alert" className="rounded-xl bg-red-50 p-4">
            Journey status unavailable.{" "}
            {data
              ? "Previously loaded records remain visible; counts may be stale."
              : "No healthy or empty state can be confirmed."}
          </p>
        )}
        {data && (
          <>
            <section
              aria-label="Journey overview"
              className="grid grid-cols-2 gap-3 md:grid-cols-4"
            >
              {[
                ["Itineraries", data.counts.itineraries],
                ["Trip items", data.counts.trip_items],
                ["Demo paid", data.counts.demo_paid],
                ["Pending / review", data.counts.attention],
              ].map(([label, value]) => (
                <div className={card} key={label}>
                  <p className="text-sm">{label}</p>
                  <p className="text-2xl font-semibold">
                    {query.isError ? "—" : value}
                  </p>
                </div>
              ))}
            </section>
            <section className={card}>
              <h2 className="mb-3 text-lg font-semibold">
                Pending actions & attention
              </h2>
              <p className="mb-3 text-sm text-slate-600">
                These are recorded journey actions. Conversation takeover and
                global automation are separate states.
              </p>
              {data.attention.length === 0 ? (
                <p>
                  {query.isError
                    ? "Queue status cannot be confirmed."
                    : "No pending or failed journey actions recorded."}
                </p>
              ) : (
                <div className="space-y-3">
                  {data.attention.map((item) => (
                    <article key={item.id} className="rounded-xl border p-4">
                      <div className="flex flex-wrap justify-between gap-2">
                        <h3 className="font-semibold">{item.guest_name}</h3>
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-sm">
                          {item.status}
                        </span>
                      </div>
                      <p className="my-2 break-words text-sm">{item.label}</p>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          className={link}
                          href={
                            "/itineraries/" +
                            encodeURIComponent(item.journey_id)
                          }
                        >
                          Review itinerary
                        </Link>
                        <Link className={link} href={item.inbox_path}>
                          Open inbox / takeover
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            {data.recovery && <IslunoRecovery data={data.recovery} />}
            <section className={card}>
              <h2 className="mb-3 text-lg font-semibold">
                Trips scheduled today
              </h2>
              <p className="mb-3 text-sm text-slate-600">
                Dates use each trip’s local timezone. Demo selections do not
                reserve supplier capacity.
              </p>
              {data.scheduled_today.length === 0 ? (
                <p>No trip selections recorded for today.</p>
              ) : (
                data.scheduled_today.map((item) => (
                  <p key={item.item_id} className="mb-3">
                    <Link
                      className="font-semibold text-teal-800"
                      href={
                        "/itineraries/" + encodeURIComponent(item.journey_id)
                      }
                    >
                      {item.product_name} · {item.guest_name}
                    </Link>
                    <br />
                    {item.starts_at} · {item.timezone} · {item.stage_label}
                  </p>
                ))
              )}
            </section>
            <section className={card}>
              <h2 className="mb-3 text-lg font-semibold">Recent itineraries</h2>
              {data.journeys.length === 0 ? (
                <p>No Isluno itineraries recorded.</p>
              ) : (
                data.journeys.slice(0, 5).map((item) => (
                  <Link
                    key={item.id}
                    href={"/itineraries/" + encodeURIComponent(item.id)}
                    className="mb-2 block rounded-xl border p-4"
                  >
                    <strong>{item.guest_name}</strong>
                    <p className="text-sm">
                      {item.item_count} trips · {money(item.totals)} ·{" "}
                      {item.stage_label}
                    </p>
                  </Link>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
