import { useState, type ReactNode } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { tenantKey } from "@/lib/query-keys";
import { getClientSlug } from "@/lib/tenant";
import { fetchIslunoCapabilities } from "@/lib/isluno-catalog";
import { ApiError } from "@/lib/error";
import {
  fetchJourneys,
  fetchJourney,
  fetchJourneyPdf,
  fetchIslunoGuests,
  money,
  type Journey,
  type JourneyItem,
  type JourneyDetail,
} from "@/lib/isluno-operations";

const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-40";
const card = "min-w-0 rounded-2xl border border-slate-200 bg-white p-5";
function date(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleString("en", { timeZone: "America/Curacao" })
    : "Not recorded";
}
export function IslunoOperationsGate({
  legacy,
  children,
}: {
  legacy: ReactNode;
  children: ReactNode;
}) {
  const capability = useQuery({
    queryKey: tenantKey("isluno-capabilities"),
    queryFn: fetchIslunoCapabilities,
    retry: false,
  });
  const view = new URLSearchParams(useSearch()).get("view");
  if (capability.isPending)
    return (
      <p role="status" className="p-8">
        Loading journey workspace…
      </p>
    );
  if (capability.error) {
    if (capability.error instanceof ApiError && capability.error.status === 404)
      return legacy;
    return (
      <div role="alert" className="p-8">
        Journey workspace could not be loaded.{" "}
        <button className={button} onClick={() => void capability.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  const enabled =
    capability.data?.enabled &&
    capability.data.tenant_slug === getClientSlug() &&
    capability.data.capabilities.itinerary_workspace;
  if (!enabled || view === "mermaid") return legacy;
  return <div key={getClientSlug()}>{children}</div>;
}
export function LegacyJourneyNotice() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm">
      <span>
        <b>Mermaid records</b> · Original single-trip history and documents.
      </span>
      <Link className={button} href="/reservations">
        Open current itineraries
      </Link>
    </div>
  );
}
function Banner() {
  return (
    <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
      Isluno demo journeys. Payment is simulated; no real charge or supplier
      booking is made. Queued and provider-accepted messages are not proof of
      guest delivery.
    </div>
  );
}
function JourneyCard({ item }: { item: Journey }) {
  return (
    <article className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-teal-700">
            {item.brand}
          </p>
          <h3 className="mt-1 text-lg font-semibold">{item.guest_name}</h3>
          <p className="mt-1 break-all text-sm text-slate-500">
            {item.customer_ref}
          </p>
        </div>
        <span className="rounded-full bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {item.stage_label}
        </span>
      </div>
      <p className="mt-4 text-sm">
        {item.item_count} trip{item.item_count === 1 ? "" : "s"} ·{" "}
        {money(item.totals)} · Revision {item.revision}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Updated {date(item.updated_at)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          className={`${button} bg-[#073b49] text-white`}
          href={"/itineraries/" + encodeURIComponent(item.id)}
        >
          Open itinerary
        </Link>
        <Link className={button} href={"/itinerary-guests/" + item.guest_id}>
          Guest history
        </Link>
        {item.valid_actions.open_inbox && (
          <Link className={button} href={item.inbox_path}>
            Open inbox / takeover
          </Link>
        )}
      </div>
    </article>
  );
}
export function IslunoJourneysPage({
  guestView = false,
}: {
  guestView?: boolean;
}) {
  const { guestId } = useParams<{ guestId?: string }>();
  const [location, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const search = params.get("q") ?? "";
  const journeys = useInfiniteQuery({
    queryKey: tenantKey("isluno-journeys", search, guestId ?? ""),
    queryFn: ({ pageParam }) => fetchJourneys(search, pageParam, guestId),
    initialPageParam: 0,
    getNextPageParam: (p) => p.next_offset ?? undefined,
    enabled: !guestView,
    retry: false,
  });
  const guests = useInfiniteQuery({
    queryKey: tenantKey("isluno-guests", search),
    queryFn: ({ pageParam }) => fetchIslunoGuests(search, pageParam),
    initialPageParam: 0,
    getNextPageParam: (p) => p.next_offset ?? undefined,
    enabled: guestView,
    retry: false,
  });
  const query = guestView ? guests : journeys;
  return (
    <DashboardShell
      activeNav="customers"
      pageTitle={
        guestView
          ? "Isluno guests"
          : guestId
            ? "Isluno guest history"
            : "Isluno itineraries"
      }
      pageSubtitle="Trip details, quote history and demo fulfillment"
      searchQuery={search}
      onSearchChange={(value) =>
        navigate(location + (value ? "?q=" + encodeURIComponent(value) : ""), {
          replace: true,
        })
      }
      hideRefresh
    >
      <main className="mx-auto min-w-0 max-w-6xl space-y-5 px-4 py-6 sm:px-8">
        <Banner />
        <nav className="flex flex-wrap gap-3">
          <Link
            href={
              guestView
                ? "/customers?view=mermaid"
                : "/reservations?view=mermaid"
            }
            className={button}
          >
            Legacy Mermaid records
          </Link>
          <Link
            href={guestView ? "/reservations" : "/customers"}
            className={button}
          >
            {guestView ? "View itineraries" : "Guest workspaces"}
          </Link>
          <button
            className={button}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </nav>
        {query.isError && (
          <div role="alert" className="rounded-xl bg-red-50 p-4">
            Some journey data could not be loaded. Previously loaded records are
            retained.{" "}
            <button className={button} onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        )}
        {query.isPending ? (
          <p role="status">Loading {guestView ? "guests" : "itineraries"}…</p>
        ) : (
          <>
            <p role="status" className="text-sm text-slate-500">
              {query.data?.pages[0]?.total ?? 0}{" "}
              {guestView ? "guests" : "itineraries"} found
            </p>
            {!query.data?.pages[0]?.total && !query.isError && (
              <p className={`${card} text-center`}>
                No {guestView ? "guests" : "itineraries"} match this search.
              </p>
            )}
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              {guestView
                ? guests.data?.pages
                    .flatMap((page) => page.items)
                    .map((guest) => (
                      <article key={guest.id} className={card}>
                        <p className="text-xs font-semibold text-teal-700">
                          ISLUNO GUEST WORKSPACE
                        </p>
                        <h3 className="mt-2 text-lg font-semibold">
                          {guest.names.join(" / ")}
                        </h3>
                        <p className="mt-1 break-all text-sm text-slate-500">
                          {guest.customer_ref}
                        </p>
                        <p className="mt-4 text-sm">
                          {guest.itinerary_count} itineraries ·{" "}
                          {guest.item_count} trip items
                        </p>
                        <Link
                          className={`${button} mt-4`}
                          href={"/itinerary-guests/" + guest.id}
                        >
                          Open guest history
                        </Link>
                      </article>
                    ))
                : journeys.data?.pages
                    .flatMap((page) => page.items)
                    .map((item) => <JourneyCard key={item.id} item={item} />)}
            </div>
            {query.hasNextPage && (
              <button
                className={button}
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                Load more
              </button>
            )}
          </>
        )}
      </main>
    </DashboardShell>
  );
}
function Trip({ item, detail }: { item: JourneyItem; detail: JourneyDetail }) {
  const guest = detail.item_details[item.id];
  const ticket = detail.documents.find(
    (d) => d.kind === "ticket" && d.item_id === item.id,
  );
  return (
    <article className={card}>
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">{item.product.name}</h3>
        <strong>
          {money({
            currency: item.currency,
            currency_exponent: item.currency_exponent,
            total_minor: item.total_minor,
          })}
        </strong>
      </div>
      <p className="mt-2 text-sm">
        {item.selection.date} · {item.starts_at.slice(11, 16)}–
        {item.ends_at.slice(11, 16)} · {item.timezone}
      </p>
      <p className="mt-2 text-sm">
        Guest: {guest?.guest_name ?? detail.guest_name} · Ages{" "}
        {item.selection.guest_ages.join(", ")}
      </p>
      <p className="mt-1 text-sm">
        Pickup:{" "}
        {guest?.pickup_location ||
          (item.selection.pickup ? "Requested" : "Meeting point")}
      </p>
      <p className="mt-3 text-sm font-medium text-teal-800">
        {detail.item_stages[item.id]?.label ?? "Item status unavailable"}
      </p>
      {ticket && (
        <p className="mt-1 break-all text-xs text-slate-500">
          Ticket {ticket.ticket_id}
        </p>
      )}
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs">
        {item.pricing_snapshot.label}
      </p>
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer text-sm font-medium">
          Itemized price
        </summary>
        <ul className="space-y-2 text-sm">
          {item.lines.map((line, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2">
              <span>
                {line.key.replaceAll("_", " ")} · {line.quantity} ×{" "}
                {money({
                  currency: item.currency,
                  currency_exponent: item.currency_exponent,
                  total_minor: line.unit_minor,
                })}
              </span>
              <span>
                {money({
                  currency: item.currency,
                  currency_exponent: item.currency_exponent,
                  total_minor: line.amount_minor,
                })}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
export function IslunoJourneyPage() {
  const { journeyId = "" } = useParams<{ journeyId: string }>();
  const query = useQuery({
    queryKey: tenantKey("isluno-journey", journeyId),
    queryFn: () => fetchJourney(journeyId),
    retry: false,
    enabled: !!journeyId,
  });
  const detail = query.data;
  const [tab, setTab] = useState("Trips");
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  async function openDocument(id: string) {
    if (!detail || opening) return;
    setOpening(id);
    setDocumentError(null);
    const preview = window.open("about:blank", "_blank");
    if (preview) preview.opener = null;
    try {
      const blob = await fetchJourneyPdf(detail.id, id);
      const url = URL.createObjectURL(blob);
      if (preview) {
        preview.location.href = url;
      } else {
        URL.revokeObjectURL(url);
        throw new Error("Allow a new tab to open the PDF.");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      preview?.close();
      setDocumentError(
        error instanceof Error ? error.message : "Document unavailable",
      );
    } finally {
      setOpening(null);
    }
  }
  return (
    <DashboardShell
      activeNav="customers"
      pageTitle={detail?.guest_name ?? "Isluno itinerary"}
      pageSubtitle="Immutable journey and fulfillment history"
      hideRefresh
    >
      <main className="mx-auto min-w-0 max-w-6xl space-y-5 px-4 py-6 sm:px-8">
        <Banner />
        <nav className="flex flex-wrap gap-3">
          <Link className={button} href="/reservations">
            All itineraries
          </Link>
          <button
            className={button}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "Refreshing…" : "Refresh"}
          </button>
          {detail?.valid_actions.open_inbox && (
            <Link className={button} href={detail.inbox_path}>
              Open inbox / takeover
            </Link>
          )}
        </nav>
        {query.isError && (
          <p role="alert" className="rounded-xl bg-red-50 p-4">
            Itinerary could not be refreshed.{" "}
            {detail
              ? "Previously loaded details remain visible."
              : "Use Refresh to try again."}
          </p>
        )}
        {!detail ? (
          <p role="status">
            {query.isPending
              ? "Loading itinerary…"
              : "No itinerary data available."}
          </p>
        ) : (
          <>
            <header className="rounded-2xl bg-[#073b49] p-6 text-white">
              <p className="text-xs font-semibold text-teal-200">
                {detail.brand.toUpperCase()}
              </p>
              <h2 className="mt-2 text-xl font-semibold">
                {detail.stage_label}
              </h2>
              <p className="mt-2">
                {detail.item_count} trips · {money(detail.totals)} · Revision{" "}
                {detail.revision}
              </p>
              <p className="mt-2 break-all text-sm text-slate-200">
                {detail.customer_ref}
              </p>
              <p className="mt-3 text-sm">
                Booking transitions remain in the verified WhatsApp journey. No
                payment or supplier action is available here.
              </p>
            </header>
            {detail.operator_requests.length > 0 && (
              <aside className="rounded-xl bg-amber-50 p-4">
                <h3 className="font-semibold">Operator requests</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {detail.operator_requests.map((r) => (
                    <li key={r.id}>
                      {r.reason.replaceAll("_", " ")} · {r.status}
                    </li>
                  ))}
                </ul>
              </aside>
            )}
            <nav aria-label="Journey sections" className="flex flex-wrap gap-2">
              {[
                "Trips",
                "Quotes",
                "Payment & documents",
                "Delivery",
                "History",
              ].map((name) => (
                <button
                  key={name}
                  className={`${button} ${tab === name ? "border-teal-700 bg-teal-50" : ""}`}
                  aria-pressed={tab === name}
                  onClick={() => setTab(name)}
                >
                  {name}
                </button>
              ))}
            </nav>
            {tab === "Trips" && (
              <div className="grid gap-4 lg:grid-cols-2">
                {detail.itinerary.items.map((item) => (
                  <Trip key={item.id} item={item} detail={detail} />
                ))}
              </div>
            )}
            {tab === "Quotes" && (
              <div className="space-y-4">
                {!detail.quotes.length && (
                  <p className={card}>No quote prepared yet.</p>
                )}
                {detail.quotes.map((q) => (
                  <article key={q.id} className={card}>
                    <h3 className="font-semibold">
                      Quote version {q.version} · {q.status}
                    </h3>
                    <p className="mt-2">
                      {money(q.snapshot.itinerary.totals)} ·{" "}
                      {q.snapshot.itinerary.items.length} trips ·{" "}
                      {q.snapshot.document_language.toUpperCase()}
                    </p>
                    <p className="mt-2 text-sm">
                      Summary confirmed: {date(q.summary_confirmed_at)}
                      <br />
                      Approved: {date(q.approved_at)}
                    </p>
                    <ul className="my-3 space-y-1 text-sm">
                      {q.snapshot.itinerary.items.map((i) => (
                        <li key={i.id}>
                          {i.product.name} · {i.selection.date} ·{" "}
                          {money({
                            currency: i.currency,
                            currency_exponent: i.currency_exponent,
                            total_minor: i.total_minor,
                          })}
                        </li>
                      ))}
                    </ul>
                    <button
                      className={button}
                      disabled={!!opening}
                      onClick={() => void openDocument(q.id)}
                    >
                      Open quote {q.version} PDF / print
                    </button>
                  </article>
                ))}
              </div>
            )}
            {tab === "Payment & documents" && (
              <div className="space-y-4">
                <section className={card}>
                  <h3 className="font-semibold">Demo payment</h3>
                  <p className="mt-2">
                    {detail.payment
                      ? "Simulated payment completed " +
                        date(detail.payment.paid_at)
                      : "No completed demo payment recorded."}
                  </p>
                  <p className="mt-2 text-sm">
                    No real money charged. No supplier booking made.
                  </p>
                  {detail.payment?.emails.map((e) => (
                    <p key={e.id} className="mt-3 break-words text-sm">
                      Receipt email: {e.recipient} · {e.status}
                      {e.error ? " · " + e.error : ""}
                    </p>
                  ))}
                </section>
                {detail.documents
                  .filter((d) => d.kind !== "quote")
                  .map((d) => (
                    <article key={d.id} className={card}>
                      <h3 className="font-semibold">
                        {d.kind === "ticket"
                          ? "Demo ticket"
                          : "Combined receipt & itinerary"}
                      </h3>
                      {d.ticket_id && (
                        <p className="my-2 break-all text-xs">{d.ticket_id}</p>
                      )}
                      <button
                        className={button}
                        disabled={!!opening}
                        onClick={() => void openDocument(d.id)}
                      >
                        {opening === d.id ? "Opening…" : "Open PDF / print"}
                      </button>
                    </article>
                  ))}
              </div>
            )}
            {documentError && (
              <p role="alert" className="rounded-xl bg-red-50 p-4">
                {documentError}
              </p>
            )}
            {tab === "Delivery" && (
              <section className={`${card} space-y-4`}>
                <p className="text-sm text-slate-600">
                  {detail.delivery_notice}
                </p>
                {detail.deliveries.length === 0 && (
                  <p>No outbound parts recorded.</p>
                )}
                {detail.deliveries.map((d) => (
                  <div
                    key={d.job_id + ":" + d.part}
                    className="rounded-xl border p-4"
                  >
                    <h3 className="mb-2 font-semibold">
                      Quote version {d.quote_version} · {d.quote_status}
                    </h3>
                    <div className="flex flex-wrap justify-between gap-2">
                      <strong className="break-words text-sm">{d.label}</strong>
                      <span
                        className={`rounded-full px-3 py-1 text-sm ${["ambiguous", "rejected", "claimed"].includes(d.status) ? "bg-amber-100" : "bg-slate-100"}`}
                      >
                        {d.status === "accepted"
                          ? "Accepted by provider"
                          : d.status}
                      </span>
                    </div>
                    <p className="mt-2 break-all text-xs text-slate-500">
                      {d.stage.replaceAll("_", " ")} · Part {d.part + 1} of{" "}
                      {d.part_count}
                    </p>
                    <p className="mt-2 break-all text-xs text-slate-500">
                      Quote reference: {d.quote_id}
                    </p>
                    {d.document_id && (
                      <p className="mt-2 break-all text-xs text-slate-500">
                        {d.document_kind ?? "Document"} reference:{" "}
                        {d.document_id}
                        {d.ticket_id ? " · Ticket " + d.ticket_id : ""}
                        {d.item_id ? " · Trip " + d.item_id : ""}
                      </p>
                    )}
                    <p className="mt-2 break-all text-xs text-slate-500">
                      Provider reference: {d.provider_id ?? "Not available"}
                    </p>
                    {["ambiguous", "claimed", "rejected"].includes(
                      d.status,
                    ) && (
                      <p className="mt-2 text-sm">
                        Review required; no automatic resend is offered.
                      </p>
                    )}
                  </div>
                ))}
              </section>
            )}
            {tab === "History" && (
              <section className={`${card} space-y-4`}>
                <h3 className="font-semibold">Recorded journey events</h3>
                {detail.events.map((event, i) => (
                  <div key={i} className="border-l-2 border-teal-200 pl-4">
                    <p className="text-sm font-medium">
                      {event.kind}
                      {event.version ? " · quote " + event.version : ""}
                      {event.revision ? " · revision " + event.revision : ""}
                    </p>
                    <p className="text-xs text-slate-500">
                      {date(event.at)}
                      {event.status ? " · " + event.status : ""}
                    </p>
                  </div>
                ))}
                <details>
                  <summary className="min-h-11 cursor-pointer font-medium">
                    Itinerary revision snapshots
                  </summary>
                  {detail.versions.map((v) => (
                    <div
                      key={v.revision}
                      className="my-3 rounded-lg bg-slate-50 p-3 text-sm"
                    >
                      Revision {v.revision} · {v.status} · {money(v.totals)}
                      <ul>
                        {v.items.map((i) => (
                          <li key={i.id}>
                            {i.product.name} · {i.selection.date}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </details>
              </section>
            )}
            {detail.related_itineraries.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-lg font-semibold">
                  Other itineraries for this guest
                </h3>
                <div className="grid gap-4 lg:grid-cols-2">
                  {detail.related_itineraries.map((item) => (
                    <JourneyCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </DashboardShell>
  );
}
export function IslunoJourneyRoute() {
  return (
    <IslunoOperationsGate
      legacy={
        <p role="alert" className="p-8">
          Isluno itinerary workspace is unavailable.
        </p>
      }
    >
      <IslunoJourneyPage />
    </IslunoOperationsGate>
  );
}
export function IslunoGuestRoute() {
  return (
    <IslunoOperationsGate
      legacy={
        <p role="alert" className="p-8">
          Isluno guest workspace is unavailable.
        </p>
      }
    >
      <IslunoJourneysPage />
    </IslunoOperationsGate>
  );
}
