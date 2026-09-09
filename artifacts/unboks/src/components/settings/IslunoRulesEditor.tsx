import type { ReactNode } from "react";
import type { Rules } from "@/lib/isluno-catalog";

export const inputStyle =
  "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-600";
export const buttonStyle =
  "min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-teal-600";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}
export function TextField({
  label,
  value,
  onChange,
  multiline = false,
  type = "text",
  maxLength = 2000,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: string;
  maxLength?: number;
}) {
  return (
    <Field label={label}>
      {multiline ? (
        <textarea
          className={inputStyle}
          rows={3}
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={inputStyle}
          type={type}
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 100000000,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <input
        className={inputStyle}
        type="number"
        min={min}
        max={max}
        step={1}
        required
        value={value ?? ""}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </Field>
  );
}
function Choice({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        className={inputStyle}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {values.map((v) => (
          <option key={v} value={v}>
            {v.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </Field>
  );
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-4 rounded-xl border border-slate-200 p-4">
      <legend className="px-2 font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}
const grid = "grid gap-4 sm:grid-cols-2";
export function IslunoRulesEditor({
  rules,
  change,
}: {
  rules: Rules;
  change: (update: (rules: Rules) => void) => void;
}) {
  const {
    guest_rules: g,
    price_rules: p,
    schedule: s,
    options,
    pickup,
    policies,
  } = rules;
  return (
    <div className="space-y-6">
      <Group title="Guest ages and capacity">
        {g ? (
          <div className={grid}>
            <NumberField
              label="Minimum guest age"
              value={g.minimum_age}
              max={120}
              onChange={(v) =>
                change((r) => {
                  r.guest_rules!.minimum_age = v;
                })
              }
            />
            <NumberField
              label="Maximum guest age"
              value={g.maximum_age}
              max={120}
              onChange={(v) =>
                change((r) => {
                  r.guest_rules!.maximum_age = v;
                })
              }
            />
            <NumberField
              label="Adult minimum age"
              value={g.adult_min_age}
              max={120}
              onChange={(v) =>
                change((r) => {
                  r.guest_rules!.adult_min_age = v;
                })
              }
            />
            {g.max_guests !== undefined && (
              <NumberField
                label="Maximum guests"
                value={g.max_guests}
                min={1}
                max={1000}
                onChange={(v) =>
                  change((r) => {
                    r.guest_rules!.max_guests = v;
                  })
                }
              />
            )}
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={g.children_require_adult ?? false}
                onChange={(e) =>
                  change((r) => {
                    r.guest_rules!.children_require_adult = e.target.checked;
                  })
                }
              />
              Children require an adult
            </label>
          </div>
        ) : (
          <p>Guest rules not confirmed.</p>
        )}
      </Group>
      <Group title="Prices">
        {p ? (
          <>
            <p className="text-sm text-slate-600">
              Amounts are in minor units: 10000 = 100.00. Currency applies to
              prices and all extras.
            </p>
            <div className={grid}>
              <Choice
                label="Currency"
                value={p.currency}
                values={["USD", "EUR", "XCG"]}
                onChange={(v) =>
                  change((r) => {
                    r.price_rules!.currency = v;
                  })
                }
              />
              <Field label="Price basis">
                <p className="mt-2">{p.basis.replaceAll("_", " ")}</p>
              </Field>
            </div>
            {p.basis === "per_booking" ? (
              <div className={grid}>
                <NumberField
                  label="Booking price (minor units)"
                  value={p.amount_minor}
                  onChange={(v) =>
                    change((r) => {
                      r.price_rules!.amount_minor = v;
                    })
                  }
                />
                <NumberField
                  label="Booking capacity"
                  value={p.max_guests}
                  min={1}
                  max={1000}
                  onChange={(v) =>
                    change((r) => {
                      r.price_rules!.max_guests = v;
                    })
                  }
                />
              </div>
            ) : (
              p.age_bands?.map((band, i) => (
                <div key={band.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="mb-2 font-medium">Age band: {band.id}</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <NumberField
                      label={`${band.id} minimum age`}
                      value={band.minimum_age}
                      max={120}
                      onChange={(v) =>
                        change((r) => {
                          r.price_rules!.age_bands![i].minimum_age = v;
                        })
                      }
                    />
                    <NumberField
                      label={`${band.id} maximum age`}
                      value={band.maximum_age}
                      max={120}
                      onChange={(v) =>
                        change((r) => {
                          r.price_rules!.age_bands![i].maximum_age = v;
                        })
                      }
                    />
                    <NumberField
                      label={`${band.id} price (minor units)`}
                      value={band.amount_minor}
                      onChange={(v) =>
                        change((r) => {
                          r.price_rules!.age_bands![i].amount_minor = v;
                        })
                      }
                    />
                  </div>
                </div>
              ))
            )}
            <div className={grid}>
              <Choice
                label="Taxes and fees"
                value={p.taxes_fees}
                values={["included", "unverified"]}
                onChange={(v) =>
                  change((r) => {
                    r.price_rules!.taxes_fees = v;
                  })
                }
              />
              <Choice
                label="Demo payment terms"
                value={p.payment_terms}
                values={["demo_full_payment", "unverified"]}
                onChange={(v) =>
                  change((r) => {
                    r.price_rules!.payment_terms = v;
                  })
                }
              />
            </div>
            <TextField
              label="Price evidence"
              value={p.evidence}
              onChange={(v) =>
                change((r) => {
                  r.price_rules!.evidence = v;
                })
              }
            />
          </>
        ) : (
          <p>
            Exact supplier prices not confirmed. Use the labelled demo rules for
            sample prices.
          </p>
        )}
      </Group>
      <Group title="Schedule">
        {s ? (
          <>
            <TextField
              label="Time zone"
              value={s.timezone}
              onChange={(v) =>
                change((r) => {
                  r.schedule!.timezone = v;
                })
              }
            />
            <div className="flex flex-wrap gap-3">
              {[
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
              ].map((day, i) => (
                <label key={day} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.weekdays.includes(i)}
                    onChange={(e) =>
                      change((r) => {
                        r.schedule!.weekdays = e.target.checked
                          ? [...r.schedule!.weekdays, i].sort()
                          : r.schedule!.weekdays.filter((d) => d !== i);
                      })
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
            {s.slots.map((slot, i) => (
              <div key={slot.id} className="rounded-lg bg-slate-50 p-3">
                <p className="mb-2 font-medium">Departure: {slot.id}</p>
                <div className={grid}>
                  <TextField
                    label={`${slot.id} departure`}
                    type="time"
                    value={slot.start}
                    onChange={(v) =>
                      change((r) => {
                        r.schedule!.slots[i].start = v;
                      })
                    }
                  />
                  <NumberField
                    label={`${slot.id} duration (minutes)`}
                    value={slot.duration_minutes}
                    min={1}
                    max={10080}
                    onChange={(v) =>
                      change((r) => {
                        r.schedule!.slots[i].duration_minutes = v;
                      })
                    }
                  />
                  {s.published_check_in_times && (
                    <TextField
                      label={`${slot.id} check-in`}
                      type="time"
                      value={s.published_check_in_times[i]}
                      onChange={(v) =>
                        change((r) => {
                          r.schedule!.published_check_in_times![i] = v;
                        })
                      }
                    />
                  )}
                </div>
              </div>
            ))}
            {s.check_in_minutes_before !== undefined && (
              <NumberField
                label="Check-in minutes before departure"
                value={s.check_in_minutes_before}
                max={1440}
                onChange={(v) =>
                  change((r) => {
                    r.schedule!.check_in_minutes_before = v;
                  })
                }
              />
            )}
            <TextField
              label="Schedule evidence"
              value={s.evidence}
              onChange={(v) =>
                change((r) => {
                  r.schedule!.evidence = v;
                })
              }
            />
          </>
        ) : (
          <p>Supplier departure times not confirmed.</p>
        )}
      </Group>
      <Group title="Extras">
        {options === null ? (
          <p>Supplier extras not confirmed.</p>
        ) : (
          <>
            {options.length === 0 && <p>No priced extras configured.</p>}
            {options.map((option, i) => (
              <div
                key={option.id}
                className="space-y-3 rounded-lg bg-slate-50 p-3"
              >
                <div className={grid}>
                  <TextField
                    label={`Extra ${i + 1} name`}
                    value={option.name}
                    maxLength={200}
                    onChange={(v) =>
                      change((r) => {
                        r.options![i].name = v;
                      })
                    }
                  />
                  <NumberField
                    label={`Extra ${i + 1} price (minor units)`}
                    value={option.amount_minor}
                    onChange={(v) =>
                      change((r) => {
                        r.options![i].amount_minor = v;
                      })
                    }
                  />
                  <NumberField
                    label={`Extra ${i + 1} maximum quantity`}
                    value={option.max_quantity}
                    min={1}
                    max={1000}
                    onChange={(v) =>
                      change((r) => {
                        r.options![i].max_quantity = v;
                      })
                    }
                  />
                  <Choice
                    label={`Extra ${i + 1} basis`}
                    value={option.basis}
                    values={["per_person", "per_booking", "per_unit"]}
                    onChange={(v) =>
                      change((r) => {
                        r.options![i].basis = v;
                      })
                    }
                  />
                </div>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={option.required}
                    onChange={(e) =>
                      change((r) => {
                        r.options![i].required = e.target.checked;
                      })
                    }
                  />
                  Required extra: {option.name}
                </label>
                <button
                  className={buttonStyle}
                  type="button"
                  onClick={() =>
                    change((r) => {
                      r.options!.splice(i, 1);
                    })
                  }
                >
                  Remove {option.name}
                </button>
              </div>
            ))}
            <button
              className={buttonStyle}
              type="button"
              onClick={() =>
                change((r) => {
                  r.options!.push({
                    id: `extra-${crypto.randomUUID().slice(0, 8)}`,
                    name: "New extra",
                    amount_minor: 0,
                    max_quantity: 1,
                    basis: "per_unit",
                    required: false,
                  });
                })
              }
            >
              Add extra
            </button>
          </>
        )}
      </Group>
      <Group title="Pickup and meeting point">
        {pickup ? (
          <div className={grid}>
            <Choice
              label="Pickup mode"
              value={pickup.mode}
              values={["meeting_point", "included", "priced_option"]}
              onChange={(v) =>
                change((r) => {
                  r.pickup!.mode = v;
                })
              }
            />
            <TextField
              label="Meeting point"
              value={pickup.meeting_point}
              maxLength={1000}
              onChange={(v) =>
                change((r) => {
                  r.pickup!.meeting_point = v;
                })
              }
            />
            {pickup.mode === "priced_option" && (
              <Choice
                label="Pickup extra"
                value={pickup.option_id ?? ""}
                values={["", ...(options ?? []).map((o) => o.id)]}
                onChange={(v) =>
                  change((r) => {
                    r.pickup!.option_id = v;
                  })
                }
              />
            )}
          </div>
        ) : (
          <p>Supplier pickup not confirmed.</p>
        )}
      </Group>
      <Group title="Policies">
        {policies ? (
          <>
            <p className="text-sm">
              {policies.verified
                ? "Catalog policy recorded"
                : "Supplier policy not confirmed"}
            </p>
            <TextField
              label="Cancellation policy"
              value={policies.cancellation}
              multiline
              maxLength={3000}
              onChange={(v) =>
                change((r) => {
                  r.policies!.cancellation = v;
                })
              }
            />
            <TextField
              label="Safety policy"
              value={policies.safety}
              multiline
              maxLength={3000}
              onChange={(v) =>
                change((r) => {
                  r.policies!.safety = v;
                })
              }
            />
            <TextField
              label="Policy evidence"
              value={policies.evidence}
              maxLength={3000}
              onChange={(v) =>
                change((r) => {
                  r.policies!.evidence = v;
                })
              }
            />
          </>
        ) : (
          <p>Supplier policies not confirmed.</p>
        )}
      </Group>
    </div>
  );
}
