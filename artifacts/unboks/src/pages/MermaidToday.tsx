import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  MessageCircleMore,
} from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { fetchMermaidReservations } from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";

export default function MermaidToday() {
  const [, navigate] = useLocation();
  const query = useQuery({
    queryKey: tenantKey("mermaid-reservations", "today"),
    queryFn: () => fetchMermaidReservations(),
    refetchInterval: 10_000,
  });
  const rows = query.data ?? [];
  const waitingPayment = rows.filter((item) => item.stage === "payment");
  const booked = rows.filter((item) => item.stage === "booked");
  const takeover = rows.filter((item) => item.humanTakeover);
  return (
    <DashboardShell
      activeNav="today"
      pageTitle="Today"
      pageSubtitle="Mermaid’s WhatsApp reservation desk · Demo mode"
      hideRefresh
    >
      <div className="mx-auto w-full max-w-[1420px] space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <section className="overflow-hidden rounded-[26px] border border-teal-200 bg-white shadow-sm">
          <div className="border-b border-teal-100 bg-gradient-to-r from-teal-50 via-white to-cyan-50 p-6">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-teal-700">
              Tropical trip desk
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Keep every guest moving toward a complete reservation
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              TRACY collects the details, sends the quote PDF and handles the
              no-money checkout. Human takeovers stay visible here.
            </p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <Metric
              icon={Clock3}
              label="Waiting for demo payment"
              value={waitingPayment.length}
            />
            <Metric
              icon={CheckCircle2}
              label="Booked today"
              value={booked.length}
            />
            <Metric
              icon={MessageCircleMore}
              label="Human takeover"
              value={takeover.length}
            />
          </div>
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">
              Needs attention
            </h2>
            <button
              onClick={() => navigate("/reservations")}
              className="flex items-center gap-1 text-sm font-semibold text-teal-800"
            >
              All reservations <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3">
            {[
              ...takeover,
              ...waitingPayment.filter((item) => !item.humanTakeover),
            ]
              .slice(0, 8)
              .map((item) => (
                <button
                  key={item.publicId}
                  onClick={() =>
                    navigate(
                      `/reservations/${encodeURIComponent(item.publicId)}`,
                    )
                  }
                  className="flex min-h-20 items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm"
                >
                  <div>
                    <p className="font-semibold text-slate-950">
                      {item.customerName}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.humanTakeover
                        ? "Waiting for a person"
                        : "Payment link sent"}{" "}
                      · {item.tripDate}
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-teal-700" />
                </button>
              ))}
            {!query.isLoading &&
            takeover.length + waitingPayment.length === 0 ? (
              <p className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">
                Nothing needs attention right now.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <Icon className="h-5 w-5 text-teal-700" />
      <p className="mt-4 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{label}</p>
    </div>
  );
}
