import {
  useEffect,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RefreshCw } from "lucide-react";
import {
  fetchMermaidCatalog,
  publishMermaidCatalog,
  type MermaidCatalogChanges,
} from "@/lib/api";
import { ApiError } from "@/lib/error";
import { tenantKey } from "@/lib/query-keys";
import { getClientSlug } from "@/lib/tenant";
import { isMermaidReservationTenant } from "@/lib/tenant-ui";
import {
  editableMermaidCatalog,
  mermaidCatalogProblem,
} from "@/lib/mermaid-catalog-settings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

const currencies = ["USD", "EUR", "XCG"];
const bands = {
  adult: "Adult",
  child_4_12: "Child · age 4–12",
  infant_0_3: "Little guest · age 0–3",
  sedula: "Sedula resident",
};
const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const inputClass =
  "mt-2 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50";
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#073b49] px-5 text-sm font-semibold text-white disabled:opacity-50";

export function MermaidTripSettings() {
  return isMermaidReservationTenant() ? (
    <TripEditor key={getClientSlug()} />
  ) : null;
}

function TripEditor() {
  const queryClient = useQueryClient();
  const key = tenantKey("mermaid-catalog");
  const query = useQuery({
    queryKey: key,
    queryFn: fetchMermaidCatalog,
    staleTime: 30_000,
  });
  const [editing, setEditing] = useState<{
    revision: string;
    initial: MermaidCatalogChanges;
    draft: MermaidCatalogChanges;
  } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publish = useMutation({
    mutationFn: ({
      revision,
      draft,
    }: {
      revision: string;
      draft: MermaidCatalogChanges;
    }) => publishMermaidCatalog(revision, draft),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      setEditing(null);
      setSaved(true);
      setConfirm(false);
      setError(null);
    },
    onError: (err) => {
      setConfirm(false);
      setError(
        err instanceof Error
          ? err.message
          : "Could not publish trip settings. Your edits are still here.",
      );
      if (err instanceof ApiError && err.status === 409) void query.refetch();
    },
  });
  const current = query.data;
  const draft =
    editing?.draft ??
    (current ? editableMermaidCatalog(current.catalog) : null);
  const dirty =
    editing !== null &&
    JSON.stringify(editing.initial) !== JSON.stringify(editing.draft);
  const conflict = Boolean(editing && current?.revision !== editing.revision);
  const problem = draft ? mermaidCatalogProblem(draft) : null;
  const editable = Boolean(current?.editable && current.revision);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit(update: (next: MermaidCatalogChanges) => void) {
    if (!current?.revision || !draft || publish.isPending) return;
    const next = structuredClone(draft);
    update(next);
    setEditing({
      revision: editing?.revision ?? current.revision,
      initial: editing?.initial ?? editableMermaidCatalog(current.catalog),
      draft: next,
    });
    setSaved(false);
    setError(null);
  }

  if (!draft || !current)
    return (
      <Section title="Trip settings">
        <p
          role={query.isError ? "alert" : "status"}
          className="text-sm text-slate-600"
        >
          {query.isError
            ? "Trip settings could not be loaded. Nothing has been changed."
            : "Loading Mermaid’s published trip settings…"}
        </p>
        {query.isError ? (
          <button
            type="button"
            className={`${secondary} mt-4`}
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        ) : null}
      </Section>
    );

  return (
    <form
      className="space-y-5"
      aria-label="Mermaid trip settings"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !problem && !conflict && editable) setConfirm(true);
      }}
    >
      <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-[#073b49]">
        Changes apply when you publish. Existing reservation prices, quotes and
        receipts stay unchanged. Times are local to Curaçao.
        <p className="mt-1 text-slate-600">
          The reservation workflow is still a demo: publishing here does not
          enable real availability, payments, reminders or insurance claims.
        </p>
      </div>
      {!editable ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"
        >
          This server does not yet support editing trip settings. Publishing is
          unavailable.
        </p>
      ) : null}
      <fieldset
        disabled={publish.isPending || !editable}
        className="space-y-5 min-w-0"
      >
        <Section title="Trip details">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Trip name"
              value={draft.service.name}
              maxLength={300}
              onChange={(value) =>
                edit((d) => {
                  d.service.name = value;
                })
              }
            />
            <Field
              label="Meeting point"
              value={draft.service.meeting_point}
              maxLength={300}
              onChange={(value) =>
                edit((d) => {
                  d.service.meeting_point = value;
                })
              }
            />
            <Field
              label="Arrival / check-in"
              type="time"
              value={draft.service.arrival_time}
              onChange={(value) =>
                edit((d) => {
                  d.service.arrival_time = value;
                })
              }
            />
            <Field
              label="Return boarding from the island"
              type="time"
              value={draft.service.island_departure_time}
              onChange={(value) =>
                edit((d) => {
                  d.service.island_departure_time = value;
                })
              }
            />
          </div>
          <fieldset className="mt-6">
            <legend className="text-sm font-semibold text-slate-800">
              Operating days
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {weekdays.map((day) => (
                <label
                  key={day}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm capitalize"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-teal-700"
                    checked={draft.service.operating_weekdays.includes(day)}
                    onChange={(event) =>
                      edit((d) => {
                        d.service.operating_weekdays = weekdays.filter(
                          (item) =>
                            item === day
                              ? event.target.checked
                              : d.service.operating_weekdays.includes(item),
                        );
                      })
                    }
                  />
                  {day.slice(0, 3)}
                </label>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-500">
              These are regular operating days, not live seat availability or
              date-specific closures.
            </p>
          </fieldset>
        </Section>
        <Section title="Guest fares">
          <p className="mb-5 text-sm text-slate-600">
            Enter whole currency amounts. Set each currency explicitly; no
            exchange rate is assumed.
          </p>
          <div className="grid gap-5 lg:grid-cols-3">
            {currencies.map((currency) => (
              <div
                key={currency}
                className="space-y-4 rounded-2xl border border-slate-200 p-4"
              >
                <h4 className="text-base font-semibold text-[#073b49]">
                  {currency}
                </h4>
                {Object.entries(bands).map(([band, label]) => (
                  <Field
                    key={band}
                    label={label}
                    aria-label={`${currency} ${label}`}
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    value={draft.pricing.currencies[currency][band]}
                    onChange={(value) =>
                      edit((d) => {
                        d.pricing.currencies[currency][band] =
                          value === "" ? NaN : Number(value);
                      })
                    }
                  />
                ))}
              </div>
            ))}
          </div>
          <Choice
            label="Default quote currency"
            value={draft.pricing.default_currency}
            choices={currencies}
            onChange={(value) =>
              edit((d) => {
                d.pricing.default_currency = value;
              })
            }
          />
        </Section>
        <Section title="Pickup & transport">
          <p className="mb-5 text-sm text-slate-600">
            Island-wide pickup. Adults, children and infants all count toward
            vehicle capacity. No currency conversion is assumed for pickup.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Pickup minutes before check-in"
              type="number"
              min={1}
              max={1439}
              step={1}
              value={draft.service.pickup_minutes_before_arrival ?? ""}
              onChange={(value) =>
                edit((d) => {
                  d.service.pickup_minutes_before_arrival =
                    value === "" ? NaN : Number(value);
                })
              }
            />
            <Choice
              label="Pickup currency"
              value={
                draft.pricing.pickup_currency ?? draft.pricing.default_currency
              }
              choices={currencies}
              onChange={(value) =>
                edit((d) => {
                  d.pricing.pickup_currency = value;
                })
              }
            />
          </div>
          {draft.pricing.pickup_vehicles ? (
            <>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {draft.pricing.pickup_vehicles.map((vehicle, index) => (
                  <div
                    key={vehicle.key}
                    className="space-y-4 rounded-2xl border border-slate-200 p-4"
                  >
                    <h4 className="text-base font-semibold capitalize text-[#073b49]">
                      {vehicle.key}
                    </h4>
                    <Field
                      label={`${vehicle.key === "car" ? "Car" : "Van"} capacity`}
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={vehicle.capacity}
                      onChange={(value) =>
                        edit((d) => {
                          d.pricing.pickup_vehicles![index].capacity =
                            value === "" ? NaN : Number(value);
                        })
                      }
                    />
                    <Field
                      label={`${vehicle.key === "car" ? "Car" : "Van"} price (${draft.pricing.pickup_currency})`}
                      type="number"
                      min={0}
                      max={100000}
                      step={1}
                      value={vehicle.price}
                      onChange={(value) =>
                        edit((d) => {
                          d.pricing.pickup_vehicles![index].price =
                            value === "" ? NaN : Number(value);
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <Choice
                label="Groups larger than one van"
                value={draft.pricing.pickup_overflow ?? "team_review"}
                choices={[
                  {
                    value: "team_review",
                    label: "Ask the crew to confirm transport",
                  },
                  {
                    value: "multiple_vans",
                    label: "Quote enough vans for the whole group",
                  },
                ]}
                onChange={(value) =>
                  edit((d) => {
                    d.pricing.pickup_overflow = value as
                      | "team_review"
                      | "multiple_vans";
                  })
                }
              />
            </>
          ) : (
            <div className="mt-5">
              <Field
                label="Flat pickup price per booking"
                type="number"
                min={0}
                max={100000}
                step={1}
                required={false}
                value={draft.pricing.pickup_price ?? ""}
                onChange={(value) =>
                  edit((d) => {
                    d.pricing.pickup_price =
                      value === "" ? null : Number(value);
                  })
                }
              />
              <p className="mt-2 text-sm text-slate-500">
                Leave blank if pickup needs a crew quote.
              </p>
            </div>
          )}
        </Section>
        <Section title="What guests need to know">
          <div className="grid gap-5 lg:grid-cols-3">
            {(
              [
                ["included", "Included"],
                ["bring", "Bring aboard"],
                ["extras", "Optional extras"],
              ] as const
            ).map(([name, label]) => (
              <TextArea
                key={name}
                label={label}
                hint="One item per line."
                value={(draft[name] ?? []).join("\n")}
                onChange={(value) =>
                  edit((d) => {
                    d[name] = value.split("\n");
                  })
                }
              />
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Pickup prices and capacity come from Pickup & transport above; don’t
            duplicate them in extras.
          </p>
        </Section>
        <Section title="Guest policies">
          <p className="mb-5 text-sm text-slate-600">
            You can edit the wording. Keep the demo policy marker and the
            insurance “not verified” wording until production policies are
            separately approved.
          </p>
          <div className="space-y-5">
            {(
              [
                ["cancellation", "Cancellation & changes"],
                ["safety", "Safety"],
                ["insurance", "Insurance"],
              ] as const
            ).map(([name, label]) => (
              <TextArea
                key={name}
                label={label}
                value={draft.policies[name]}
                onChange={(value) =>
                  edit((d) => {
                    d.policies[name] = value;
                  })
                }
              />
            ))}
          </div>
        </Section>
      </fieldset>
      <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div aria-live="polite" className="text-sm">
          {saved ? (
            <p
              role="status"
              className="mb-3 flex items-center gap-2 text-teal-800"
            >
              <Check className="size-4" />
              Published. TRACY will use these settings for new quotes.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mb-3 text-red-700">
              {error}
            </p>
          ) : null}
          {conflict ? (
            <p role="alert" className="mb-3 text-amber-800">
              Another update was published. Your edits are preserved here;
              discard them and reload before editing the newest version.
            </p>
          ) : null}
          {dirty && problem ? (
            <p role="alert" className="mb-3 text-amber-800">
              {problem}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            {dirty ? "Unpublished changes" : "Published trip settings"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondary}
              disabled={publish.isPending}
              onClick={() => {
                setEditing(null);
                setError(null);
                setSaved(false);
                void query.refetch();
              }}
            >
              <RefreshCw className="size-4" />
              {dirty ? "Discard edits & reload" : "Reload"}
            </button>
            <button
              type="submit"
              className={primary}
              disabled={
                !dirty ||
                !editable ||
                Boolean(problem) ||
                conflict ||
                publish.isPending
              }
            >
              {publish.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Review & publish
            </button>
          </div>
        </div>
      </div>
      <Dialog
        open={confirm}
        onOpenChange={(open) => {
          if (!publish.isPending) setConfirm(open);
        }}
      >
        <DialogContent className="max-w-[min(32rem,calc(100vw-2rem))] rounded-2xl">
          <DialogTitle>Publish Mermaid trip settings?</DialogTitle>
          <DialogDescription>
            TRACY will use these details for new enquiries and quotes. Existing
            reservation prices, quotes and receipts will not be recalculated. No
            guests will be messaged by this action.
          </DialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={secondary}
              disabled={publish.isPending}
              onClick={() => setConfirm(false)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className={primary}
              disabled={publish.isPending || conflict || !editing}
              onClick={() => {
                if (!editing || conflict) return;
                const cleaned = structuredClone(editing.draft);
                for (const field of ["included", "bring", "extras"] as const)
                  cleaned[field] = (cleaned[field] ?? [])
                    .map((line) => line.trim())
                    .filter(Boolean);
                publish.mutate({ revision: editing.revision, draft: cleaned });
              }}
            >
              {publish.isPending ? "Publishing…" : "Publish changes"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 sm:p-6">
      <h3 className="mb-5 text-lg font-semibold text-[#073b49]">{title}</h3>
      {children}
    </section>
  );
}
function Field({
  label,
  onChange,
  value,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        required
        {...props}
        value={typeof value === "number" && Number.isNaN(value) ? "" : value}
        className={inputClass}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function TextArea({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {hint ? (
        <span className="ml-2 font-normal text-slate-500">{hint}</span>
      ) : null}
      <textarea
        aria-label={label}
        rows={5}
        maxLength={5000}
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function Choice({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: Array<string | { value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-5 block max-w-md text-sm font-medium text-slate-700">
      {label}
      <select
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {choices.map((choice) =>
          typeof choice === "string" ? (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ) : (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ),
        )}
      </select>
    </label>
  );
}
