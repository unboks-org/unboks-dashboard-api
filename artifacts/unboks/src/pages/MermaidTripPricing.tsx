import { useQuery } from "@tanstack/react-query";
import { Clock3, MapPin, ShieldAlert, Sun } from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { fetchMermaidCatalog } from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";

export default function MermaidTripPricing() {
  const query = useQuery({
    queryKey: tenantKey("mermaid-catalog"),
    queryFn: fetchMermaidCatalog,
    staleTime: 30_000,
  });
  const catalog = query.data?.catalog;
  return (
    <DashboardShell
      activeNav="rental"
      pageTitle="Trip & pricing"
      pageSubtitle="One versioned source for TRACY, quotes and the dashboard"
      hideRefresh
    >
      <div className="mx-auto w-full max-w-[1200px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <b>Demo catalog.</b> Cancellation, safety and insurance wording must
          be replaced and approved before go-live.
        </div>
        {!catalog ? (
          <div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500">
            {query.isError
              ? "Catalog could not be loaded."
              : "Loading catalog…"}
          </div>
        ) : (
          <>
            <section className="rounded-[24px] border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-950">
                {catalog.service.name}
              </h2>
              <p className="mt-1 text-xs font-mono text-slate-500">
                {catalog.version}
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Fact
                  icon={MapPin}
                  label="Meeting point"
                  value={catalog.service.meeting_point}
                />
                <Fact
                  icon={Clock3}
                  label="Arrival"
                  value={catalog.service.arrival_time}
                />
                <Fact
                  icon={Sun}
                  label="Island departure"
                  value={`About ${catalog.service.island_departure_time}`}
                />
              </div>
            </section>
            <section className="grid gap-4 lg:grid-cols-3">
              {Object.entries(catalog.pricing.currencies).map(
                ([currency, prices]) => (
                  <div
                    key={currency}
                    className="rounded-[22px] border bg-white p-5 shadow-sm"
                  >
                    <h3 className="text-lg font-bold text-teal-800">
                      {currency}
                    </h3>
                    <Price
                      label="Adult"
                      value={prices.adult}
                      currency={currency}
                    />
                    <Price
                      label="Child 4-12"
                      value={prices.child_4_12}
                      currency={currency}
                    />
                    <Price
                      label="Age 0-3"
                      value={prices.infant_0_3}
                      currency={currency}
                    />
                  </div>
                ),
              )}
            </section>
            <section className="grid gap-4 lg:grid-cols-2">
              <List title="Included" values={catalog.included} />
              <List title="Bring" values={catalog.bring} />
            </section>
            <section className="rounded-[22px] border border-rose-200 bg-white p-5">
              <h3 className="flex items-center gap-2 font-semibold text-rose-900">
                <ShieldAlert className="h-5 w-5" /> Demo policy boundaries
              </h3>
              <p className="mt-3 text-sm text-slate-700">
                {catalog.policies.cancellation}
              </p>
              <p className="mt-3 text-sm text-slate-700">
                {catalog.policies.safety}
              </p>
              <p className="mt-3 text-sm font-semibold text-rose-800">
                {catalog.policies.insurance}
              </p>
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-teal-50 p-4">
      <Icon className="h-5 w-5 text-teal-700" />
      <p className="mt-3 text-xs font-semibold uppercase text-teal-800">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-950">{value}</p>
    </div>
  );
}
function Price({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: string;
}) {
  return (
    <div className="mt-3 flex justify-between border-t pt-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <b>
        {currency} {value.toFixed(2)}
      </b>
    </div>
  );
}
function List({ title, values }: { title: string; values: string[] }) {
  return (
    <section className="rounded-[22px] border bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <ul className="mt-3 grid gap-2 text-sm text-slate-700">
        {values.map((value) => (
          <li key={value} className="flex gap-2">
            <span className="text-teal-600">•</span>
            {value}
          </li>
        ))}
      </ul>
    </section>
  );
}
