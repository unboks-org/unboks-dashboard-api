import { useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  CarFront,
  CircleDollarSign,
  Clock3,
  MessageCircleMore,
  Phone,
  Printer,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { AliCustomerFile } from "@/components/ali/AliCustomerFile";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { RentalBackButton } from "@/components/rental/RentalDashboardShell";
import { fetchQuoteLeads } from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";
import {
  customerDisplayName,
  projectRentalLead,
  RENTAL_PROGRESS_STAGES,
  rentalStageLabel,
} from "@/lib/rental-operations";
import { cn } from "@/lib/utils";

function value(input: unknown, fallback = "Not provided"): string {
  if (input === null || input === undefined || input === "") return fallback;
  return String(input);
}

export default function RentalCustomerWorkspace() {
  const params = useParams<{ reservationId: string }>();
  const [, navigate] = useLocation();
  const reservationId = decodeURIComponent(params.reservationId || "");
  const query = useQuery({
    queryKey: tenantKey("quote-leads"),
    queryFn: () => fetchQuoteLeads(),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const lead = useMemo(() => {
    const wantedId = reservationId.startsWith("lead-")
      ? reservationId.slice(5)
      : reservationId;
    return (
      (query.data || []).find(
        (item) =>
          item.reservation_public_id === reservationId ||
          String(item.id) === wantedId,
      ) || null
    );
  }, [query.data, reservationId]);

  if (query.isLoading) {
    return (
      <DashboardShell
        activeNav="customers"
        pageTitle="Customer"
        pageSubtitle="Loading secure customer file"
        hideRefresh
      >
        <div className="mx-auto max-w-[1300px] p-8 text-sm text-[#6d7784]">
          Loading customer workspace…
        </div>
      </DashboardShell>
    );
  }

  if (!lead) {
    return (
      <DashboardShell
        activeNav="customers"
        pageTitle="Customer not found"
        pageSubtitle="The requested record is no longer in this workspace"
        hideRefresh
      >
        <div className="mx-auto max-w-[1000px] p-6">
          <RentalBackButton />
        </div>
      </DashboardShell>
    );
  }

  const operation = projectRentalLead(lead);
  const currentIndex = RENTAL_PROGRESS_STAGES.findIndex(
    (item) => item.key === operation.stage,
  );
  const conversationUrl = `/conversations?c=${encodeURIComponent(lead.conversation_id)}&from=customers`;

  return (
    <DashboardShell
      activeNav="customers"
      pageTitle={customerDisplayName(lead)}
      pageSubtitle={
        lead.reservation_reference ||
        lead.quote_reference ||
        "Rental customer file"
      }
      hideRefresh
    >
      <div className="mx-auto w-full max-w-[1480px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RentalBackButton />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate(conversationUrl)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#ded8cd] bg-white px-4 text-sm font-semibold text-[#31445d] hover:border-[#c9b98f]"
            >
              <MessageCircleMore className="h-4 w-4" /> Open conversation
            </button>
            {lead.reservation_public_id ? (
              <button
                type="button"
                onClick={() => {
                  const action = document.getElementById(
                    "dossier-print-action",
                  );
                  action?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                  if (action instanceof HTMLButtonElement) action.click();
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0b213a] px-4 text-sm font-semibold text-white hover:bg-[#163754]"
              >
                <Printer className="h-4 w-4" /> Print complete dossier
              </button>
            ) : null}
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-[#e2ddd3] bg-white shadow-[0_12px_34px_rgba(24,37,52,.06)]">
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5 xl:p-6">
            <Fact
              icon={UserRound}
              label="Customer"
              text={customerDisplayName(lead)}
            />
            <Fact
              icon={Phone}
              label="WhatsApp"
              text={value(lead.phone_normalized || lead.phone_raw)}
            />
            <Fact
              icon={CarFront}
              label="Selected vehicle"
              text={value(lead.vehicle_preference, "Not selected yet")}
            />
            <Fact
              icon={CalendarDays}
              label="Rental period"
              text={value(
                lead.rental_period ||
                  `${value(lead.pickup_datetime, "—")} → ${value(lead.return_datetime, "—")}`,
              )}
            />
            <Fact
              icon={CircleDollarSign}
              label="Reference"
              text={value(
                lead.reservation_reference || lead.quote_reference,
                "Not issued yet",
              )}
            />
          </div>
          <div className="overflow-x-auto border-t border-[#e9e4db] bg-[#faf8f3] px-4 py-4 sm:px-6">
            <ol
              className="flex min-w-[760px] items-center"
              aria-label="Rental progress"
            >
              {RENTAL_PROGRESS_STAGES.map((item, index) => {
                const complete =
                  operation.stage === "confirmed" || index < currentIndex;
                const current = index === currentIndex;
                return (
                  <li
                    key={item.key}
                    className="flex flex-1 items-center last:flex-none"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold",
                          complete
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : current
                              ? "border-[#c39335] bg-[#fff6df] text-[#805b17]"
                              : "border-[#d8d3ca] bg-white text-[#8c949d]",
                        )}
                      >
                        {complete ? "✓" : index + 1}
                      </span>
                      <span
                        className={cn(
                          "whitespace-nowrap text-xs font-semibold",
                          current
                            ? "text-[#805b17]"
                            : complete
                              ? "text-[#2f6253]"
                              : "text-[#7d8793]",
                        )}
                      >
                        {item.label}
                      </span>
                    </span>
                    {index < RENTAL_PROGRESS_STAGES.length - 1 ? (
                      <span
                        className={cn(
                          "mx-3 h-px flex-1",
                          complete ? "bg-emerald-400" : "bg-[#d8d3ca]",
                        )}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)]">
          <div className="rounded-2xl border border-[#e2ddd3] bg-white p-5 shadow-[0_10px_30px_rgba(24,37,52,.05)] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#9b6f1a]">
                  Current action
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[#0b213a]">
                  {operation.responsibleParty === "Staff"
                    ? operation.actionLabel
                    : `Waiting on ${operation.responsibleParty.toLowerCase()}`}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687483]">
                  {lead.next_action ||
                    "Open the customer file below to review the current workflow state and the next server-authorized action."}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex rounded-full border px-3 py-1.5 text-xs font-bold",
                  operation.exception
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-[#ead8af] bg-[#fff8e8] text-[#805b17]",
                )}
              >
                {rentalStageLabel(operation.stage)}
              </span>
            </div>
            {operation.responsibleParty === "Staff" ? (
              <a
                href="#secure-file"
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d4aa58] px-4 text-sm font-bold text-[#10243e] hover:bg-[#c99b43]"
              >
                {operation.actionLabel} <ArrowRight className="h-4 w-4" />
              </a>
            ) : null}
          </div>

          <aside className="rounded-2xl border border-[#e2ddd3] bg-[#0b213a] p-5 text-white shadow-[0_12px_30px_rgba(11,33,58,.14)]">
            <div className="flex items-center gap-2 text-[#e2bd70]">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-[0.12em]">
                Secure file
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-white/70">
              Identity documents, signed agreements, payments and dossier
              downloads remain private, authenticated and audited.
            </p>
            <div className="mt-5 flex items-center gap-2 text-xs text-white/55">
              <Clock3 className="h-4 w-4" /> Responsible:{" "}
              {operation.responsibleParty}
            </div>
          </aside>
        </section>

        <section
          id="secure-file"
          className="scroll-mt-24 rounded-2xl border border-[#e2ddd3] bg-white p-4 shadow-[0_12px_34px_rgba(24,37,52,.06)] sm:p-6"
        >
          <div className="mb-5 border-b border-[#e9e4db] pb-4">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#9b6f1a]">
              Customer workspace
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[#0b213a]">
              Documents, agreement, payment and dossier
            </h2>
          </div>
          {lead.reservation_public_id ? (
            <AliCustomerFile publicId={lead.reservation_public_id} enabled />
          ) : (
            <div className="rounded-xl border border-[#e5dfd5] bg-[#faf8f3] p-5 text-sm leading-6 text-[#5e6c7e]">
              This customer is still in the quote stage. Nick is gathering the
              remaining rental details before an official quote and reservation
              file can be created.
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}

function Fact({
  icon: Icon,
  label,
  text,
}: {
  icon: typeof UserRound;
  label: string;
  text: string;
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3efe6] text-[#8b641d]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8a929c]">
          {label}
        </span>
        <span className="mt-1 block break-words text-sm font-semibold text-[#31445d]">
          {text}
        </span>
      </span>
    </div>
  );
}
