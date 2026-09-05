import { useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Download, MessageCircleMore, Phone } from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import {
  fetchMermaidCustomer,
  fetchMermaidCustomerDocument,
  fetchMermaidCustomerHistory,
  type MermaidCustomerDetails,
  type MermaidCustomerMessage,
  type MermaidCustomerRevision,
} from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";
import {
  formatMermaidActivity,
  formatMermaidTripDate,
  mermaidConversationHref,
  MERMAID_STAGE_META,
} from "@/lib/mermaid-operations";

const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50 focus-visible:outline-teal-700 disabled:opacity-50";
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="mb-5 text-lg font-semibold text-slate-950">{title}</h2>
      {children}
    </section>
  );
}
function Details({ data }: { data: MermaidCustomerDetails }) {
  const entries: Array<[string, string | number | undefined]> = [
    ["Name", data.customer_name],
    ["Contact number", data.contact_phone],
    ["Email", data.email],
    ["Language", data.language?.toUpperCase()],
    [
      "Trip date",
      data.trip_date ? formatMermaidTripDate(data.trip_date) : undefined,
    ],
    ["Adults", data.adults],
    ["Children (4–12)", data.children],
    ["Children (0–3)", data.infants],
    [
      "Children’s known ages",
      data.child_ages?.map((age) => `${age.value} ${age.unit}`).join(", "),
    ],
    [
      "Transport",
      data.pickup_preference === "pier"
        ? "Meeting at the pier"
        : data.pickup_preference === "pickup_requested"
          ? "Pickup requested"
          : undefined,
    ],
    ["Pickup location", data.pickup_location],
    ["Dietary requirements", data.dietary_requirements],
    ["Accessibility", data.accessibility_notes],
    ["Special requests", data.special_requests],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      {entries.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-900">
            {value === undefined || value === "" ? "Not provided" : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function History({ id, changes }: { id: string; changes: boolean }) {
  const query = useInfiniteQuery({
    queryKey: tenantKey("mermaid-customer-history", id, changes),
    queryFn: ({ pageParam }) =>
      fetchMermaidCustomerHistory<
        MermaidCustomerMessage | MermaidCustomerRevision
      >(id, pageParam, changes),
    initialPageParam: null as number | null,
    getNextPageParam: (page) => page.nextBefore ?? undefined,
    refetchInterval: changes ? false : 10_000,
  });
  const pages = query.data?.pages ?? [];
  const items = (changes ? pages : [...pages].reverse()).flatMap(
    (page) => page.items,
  );
  const more = query.hasNextPage ? (
    <button
      className={button}
      disabled={query.isFetchingNextPage}
      onClick={() => void query.fetchNextPage()}
    >
      {query.isFetchingNextPage
        ? "Loading…"
        : changes
          ? "Load earlier changes"
          : "Load earlier messages"}
    </button>
  ) : null;
  return (
    <div className="space-y-4">
      {!changes ? more : null}
      {query.isPending ? (
        <p className="text-sm text-slate-500">Loading history…</p>
      ) : null}
      {query.isError ? (
        <p role="alert">
          History could not be loaded.{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Try again
          </button>
        </p>
      ) : null}
      {!query.isPending && !query.isError && items.length === 0 ? (
        <p className="text-sm text-slate-500">
          {changes ? "No details collected yet." : "No saved messages yet."}
        </p>
      ) : null}
      <div className="max-h-[620px] space-y-4 overflow-y-auto pr-1">
        {items.map((item) =>
          "details" in item ? (
            <details
              key={item.id}
              className="rounded-2xl border border-slate-200 p-4"
            >
              <summary className="cursor-pointer text-sm font-medium">
                Details saved · {formatMermaidActivity(item.createdAt)}
              </summary>
              <div className="mt-5">
                <Details data={item.details} />
              </div>
            </details>
          ) : (
            <article
              key={item.id}
              className={`max-w-[94%] rounded-2xl px-4 py-3 text-sm leading-6 ${item.role === "user" ? "bg-slate-100 text-slate-900" : "ml-auto bg-teal-800 text-white"}`}
            >
              <p className="mb-1 text-[11px] font-semibold opacity-80">
                {item.role === "user"
                  ? item.sender_name || "Guest"
                  : item.role === "assistant"
                    ? "Tracy"
                    : item.role === "operator"
                      ? "Team"
                      : "System"}{" "}
                · {formatMermaidActivity(item.created_at)}
              </p>
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {item.text}
              </p>
            </article>
          ),
        )}
      </div>
      {changes ? more : null}
    </div>
  );
}
function DocumentButton({
  customerId,
  id,
  filename,
}: {
  customerId: string;
  id: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const blob = await fetchMermaidCustomerDocument(customerId, id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setError("The PDF could not be downloaded. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <button
        disabled={busy}
        onClick={() => void download()}
        className={`${button} w-full justify-start text-left`}
      >
        <Download className="h-4 w-4 shrink-0" />
        <span className="min-w-0 break-words">
          {busy ? "Downloading…" : filename}
        </span>
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
export default function MermaidCustomerAccount() {
  const { reservationId: id = "" } = useParams<{ reservationId: string }>();
  const query = useQuery({
    queryKey: tenantKey("mermaid-customer", id),
    queryFn: () => fetchMermaidCustomer(id),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });
  const [tab, setTab] = useState<"messages" | "changes">("messages");
  const item = query.data;
  return (
    <DashboardShell
      activeNav="customers"
      pageTitle={item?.customerName || "Customer account"}
      pageSubtitle="Guest details, reservations and history"
      hideRefresh
    >
      <div className="mx-auto max-w-[1300px] space-y-5 px-4 py-6 [overflow-wrap:anywhere] sm:px-8">
        <Link href="/customers" className={button}>
          ← All customers
        </Link>
        {!item ? (
          <Card
            title={
              query.isError
                ? "Customer account unavailable"
                : "Loading customer…"
            }
          >
            {query.isError ? (
              <button className={button} onClick={() => void query.refetch()}>
                Try again
              </button>
            ) : (
              <p className="text-sm text-slate-500">
                Loading saved details and bookings.
              </p>
            )}
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {item.details.contact_phone ? (
                <a
                  className={button}
                  href={`tel:${item.details.contact_phone}`}
                >
                  <Phone className="h-4 w-4" />
                  {item.details.contact_phone}
                </a>
              ) : (
                <span className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Contact number not yet provided
                </span>
              )}
              <Link
                className={button}
                href={mermaidConversationHref(item.conversationId)}
              >
                <MessageCircleMore className="h-4 w-4" />
                Open conversation
              </Link>
              <span className="text-xs text-slate-500">
                Customer since {formatMermaidActivity(item.firstSeen)}
              </span>
            </div>
            <div className="grid items-start gap-5 lg:grid-cols-[1fr_1fr]">
              <div className="min-w-0 space-y-5">
                <Card title="Latest guest details">
                  <Details data={item.details} />
                </Card>
                <Card title="Reservations & documents">
                  {item.reservations.length === 0 ? (
                    <p className="text-sm leading-6 text-slate-500">
                      No booking yet. The enquiry and collected details are
                      already saved in this account.
                    </p>
                  ) : (
                    <div className="space-y-5">
                      {item.reservations.map((reservation) => (
                        <article
                          key={reservation.publicId}
                          className="space-y-3 rounded-2xl border border-slate-200 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="font-semibold">
                                {formatMermaidTripDate(reservation.tripDate)}
                              </h3>
                              <p className="mt-1 text-xs text-slate-500">
                                {reservation.adults +
                                  reservation.children +
                                  reservation.infants}{" "}
                                guests ·{" "}
                                {MERMAID_STAGE_META[reservation.stage].label}
                              </p>
                            </div>
                            <span className="text-sm font-semibold">
                              {reservation.currency}{" "}
                              {reservation.total.toFixed(2)}
                            </span>
                          </div>
                          {reservation.bookingCode ? (
                            <p className="text-xs text-teal-800">
                              Booking {reservation.bookingCode}
                            </p>
                          ) : null}
                          {reservation.paymentReference ? (
                            <p className="text-xs text-slate-500">
                              Demo payment {reservation.paymentReference}
                            </p>
                          ) : null}
                          <Link
                            className={button}
                            href={`/reservations/${encodeURIComponent(reservation.publicId)}`}
                          >
                            View booking details
                          </Link>
                          {reservation.documents.map((doc) => (
                            <DocumentButton
                              key={doc.public_id}
                              customerId={id}
                              id={doc.public_id}
                              filename={doc.filename}
                            />
                          ))}
                        </article>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
              <Card title="Customer history">
                <div
                  className="mb-5 flex flex-wrap gap-2"
                  role="group"
                  aria-label="Customer history view"
                >
                  {(["messages", "changes"] as const).map((value) => (
                    <button
                      key={value}
                      className={`${button} ${tab === value ? "bg-teal-50 ring-1 ring-teal-600" : ""}`}
                      aria-pressed={tab === value}
                      onClick={() => setTab(value)}
                    >
                      {value === "messages"
                        ? `Conversation (${item.messageCount})`
                        : "Detail changes"}
                    </button>
                  ))}
                </div>
                <History
                  key={`${id}-${tab}`}
                  id={id}
                  changes={tab === "changes"}
                />
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
