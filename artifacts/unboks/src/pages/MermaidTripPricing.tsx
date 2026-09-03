import { useQuery } from "@tanstack/react-query";
import {
  Anchor,
  Check,
  Clock3,
  MapPin,
  ShieldAlert,
  Sparkles,
  Sun,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { fetchMermaidCatalog } from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";

const priceLabels: Record<string, string> = {
  adult: "Adult",
  child_4_12: "Child · age 4–12",
  infant_0_3: "Little guest · age 0–3",
  sedula: "Sedula resident",
};

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
      pageSubtitle="The versioned source shared by TRACY, quotes and operations"
      hideRefresh
    >
      <div className="mx-auto w-full max-w-[1320px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        {!catalog ? (
          <div className="rounded-[26px] border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">
            {query.isError
              ? "The trip catalog could not be loaded."
              : "Loading the approved trip snapshot…"}
          </div>
        ) : (
          <>
            <section className="relative overflow-hidden rounded-[30px] bg-[#073b49] text-white shadow-[0_22px_55px_rgba(7,59,73,.18)]">
              <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl" />
              <div className="relative grid gap-7 p-6 sm:p-8 lg:grid-cols-[1.05fr_.95fr] lg:items-end lg:p-10">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.17em] text-cyan-100">
                    <Sparkles className="h-3.5 w-3.5" /> Single source of truth
                  </span>
                  <h2 className="mt-5 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">
                    {catalog.service.name}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-white/65">
                    This exact snapshot travels with every quote, protecting
                    guest totals from silent price changes later in the journey.
                  </p>
                  <p className="mt-5 font-mono text-xs text-cyan-200">
                    {catalog.version}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Fact
                    icon={MapPin}
                    label="Meet"
                    value={catalog.service.meeting_point}
                  />
                  <Fact
                    icon={Clock3}
                    label="Arrive"
                    value={catalog.service.arrival_time}
                  />
                  <Fact
                    icon={Sun}
                    label="Return boards"
                    value={catalog.service.island_departure_time}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-[25px] border border-slate-200 bg-white p-5 shadow-[0_12px_35px_rgba(15,36,51,.045)] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.17em] text-teal-700">
                    Sailing rhythm
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">
                    Published operating days
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {catalog.service.operating_weekdays.map((day) => (
                    <span
                      key={day}
                      className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold capitalize text-teal-800 ring-1 ring-teal-100"
                    >
                      {day.slice(0, 3)}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs leading-5 text-slate-500">
                <Waves className="h-4 w-4 shrink-0 text-teal-700" />{" "}
                Date-specific operation still requires the official reservation
                flow.
              </p>
            </section>

            <section>
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[.17em] text-teal-700">
                  Rate card
                </p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-.02em] text-slate-950">
                  Guest pricing by currency
                </h3>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                {Object.entries(catalog.pricing.currencies).map(
                  ([currency, prices]) => (
                    <article
                      key={currency}
                      className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_35px_rgba(15,36,51,.045)]"
                    >
                      <div className="flex items-center justify-between bg-[#f1f9f7] px-5 py-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-teal-700">
                            Currency
                          </p>
                          <h4 className="mt-1 text-xl font-semibold text-[#073b49]">
                            {currency}
                          </h4>
                        </div>
                        {currency === catalog.pricing.default_currency ? (
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase text-teal-800 ring-1 ring-teal-100">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <div className="divide-y divide-slate-100 px-5 py-1">
                        {Object.entries(prices).map(([key, value]) => (
                          <Price
                            key={key}
                            label={priceLabels[key] ?? key.replaceAll("_", " ")}
                            value={value}
                            currency={currency}
                          />
                        ))}
                      </div>
                    </article>
                  ),
                )}
              </div>
              <p className="mt-3 text-xs text-slate-600">
                Pickup can be requested, but its price is intentionally not
                guessed in this catalog.
              </p>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <List title="Included" values={catalog.included} icon={Check} />
              <List title="Bring aboard" values={catalog.bring} icon={Anchor} />
              <List
                title="Optional extras"
                values={
                  catalog.extras ?? ["Pickup and return can be requested"]
                }
                icon={Sparkles}
              />
            </section>

            <section className="overflow-hidden rounded-[25px] border border-amber-200 bg-white shadow-[0_12px_35px_rgba(15,36,51,.045)]">
              <div className="flex items-center gap-3 bg-amber-50 px-5 py-4 text-amber-950 sm:px-6">
                <ShieldAlert className="h-5 w-5" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-700">
                    Go-live gate
                  </p>
                  <h3 className="mt-0.5 font-semibold">
                    Policy wording still requires Mermaid approval
                  </h3>
                </div>
              </div>
              <div className="grid gap-4 p-5 text-sm leading-6 text-slate-700 sm:p-6 lg:grid-cols-3">
                <Policy
                  label="Cancellation"
                  value={catalog.policies.cancellation}
                />
                <Policy label="Safety" value={catalog.policies.safety} />
                <Policy label="Insurance" value={catalog.policies.insurance} />
              </div>
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
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.07] p-4 backdrop-blur-sm">
      <Icon className="h-5 w-5 text-cyan-300" />
      <p className="mt-3 text-[10px] font-bold uppercase tracking-[.13em] text-white/70">
        {label}
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-white">{value}</p>
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
    <div className="flex min-h-14 items-center justify-between gap-4 py-3 text-sm">
      <span className="capitalize text-slate-600">{label}</span>
      <b className="text-slate-950">
        {currency} {value.toFixed(2)}
      </b>
    </div>
  );
}

function List({
  title,
  values,
  icon: Icon,
}: {
  title: string;
  values: string[];
  icon: LucideIcon;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_35px_rgba(15,36,51,.045)] sm:p-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-800">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 font-semibold text-slate-950">{title}</h3>
      <ul className="mt-3 space-y-2.5 text-sm leading-5 text-slate-600">
        {values.map((value) => (
          <li key={value} className="flex gap-2.5">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
            {value}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Policy({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[.13em] text-amber-700">
        {label}
      </p>
      <p className="mt-1.5">{value}</p>
    </div>
  );
}
