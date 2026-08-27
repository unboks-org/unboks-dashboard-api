import { Archive, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type {
  RentalCatalogDocument,
  RentalFieldError,
  RentalSupplement,
} from "@/lib/rental-catalog";
import {
  FieldShell,
  MoneyInput,
  RentalInput,
  RentalSelect,
  SectionCard,
  secondaryButton,
} from "./RentalFields";

function newSupplement(index: number): RentalSupplement {
  return {
    id: `supplement-${crypto.randomUUID()}`,
    name: "New supplement",
    priceCents: 0,
    billingBasis: "per_rental",
    quantitySelectable: false,
    maxQuantity: 1,
    active: true,
    displayOrder: index,
    archivedAt: null,
  };
}

export function RentalChargesView({
  document,
  onChange,
  errors,
}: {
  document: RentalCatalogDocument;
  onChange: (document: RentalCatalogDocument) => void;
  errors: RentalFieldError[];
}) {
  const updateSupplement = (
    index: number,
    patch: Partial<RentalSupplement>,
  ) => {
    onChange({
      ...document,
      supplements: document.supplements.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    });
  };
  const errorAt = (path: string) =>
    errors.find((error) => error.path === path)?.message;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Refundable security deposit"
        description="Shown separately and included exactly once in the customer grand total."
      >
        <div className="max-w-sm">
          <FieldShell
            label="Tenant-wide deposit"
            hint="This value is refundable and is not rental revenue."
            error={errorAt("settings.refundableSecurityDepositCents")}
          >
            <MoneyInput
              cents={document.settings.refundableSecurityDepositCents}
              ariaLabel="Refundable security deposit"
              onCents={(refundableSecurityDepositCents) =>
                onChange({
                  ...document,
                  settings: {
                    ...document.settings,
                    refundableSecurityDepositCents,
                  },
                })
              }
            />
          </FieldShell>
        </div>
      </SectionCard>

      <SectionCard
        title="Supplements"
        description="Simple fixed add-ons billed per rental day or once per rental."
        action={
          <button
            type="button"
            className={secondaryButton}
            onClick={() =>
              onChange({
                ...document,
                supplements: [
                  ...document.supplements,
                  newSupplement(document.supplements.length),
                ],
              })
            }
          >
            <Plus className="h-3.5 w-3.5" /> Add supplement
          </button>
        }
      >
        {document.supplements.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#d6dbe3] p-5 text-center text-[13px] text-[#5f6368]">
            No supplements in this draft.
          </p>
        ) : (
          <div className="space-y-3">
            {document.supplements.map((supplement, index) => (
              <article
                key={supplement.id}
                className="rounded-xl border border-[#e8eaed] bg-[#fbfcff] p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_170px_170px_140px]">
                  <FieldShell
                    label="Supplement"
                    error={errorAt(`supplements.${index}.name`)}
                  >
                    <RentalInput
                      value={supplement.name}
                      maxLength={80}
                      disabled={Boolean(supplement.archivedAt)}
                      onChange={(event) =>
                        updateSupplement(index, { name: event.target.value })
                      }
                    />
                  </FieldShell>
                  <FieldShell
                    label="Price"
                    error={errorAt(`supplements.${index}.priceCents`)}
                  >
                    <MoneyInput
                      cents={supplement.priceCents}
                      ariaLabel={`${supplement.name} price`}
                      disabled={Boolean(supplement.archivedAt)}
                      onCents={(priceCents) =>
                        updateSupplement(index, { priceCents })
                      }
                    />
                  </FieldShell>
                  <FieldShell label="Billing basis">
                    <RentalSelect
                      value={supplement.billingBasis}
                      disabled={Boolean(supplement.archivedAt)}
                      onChange={(event) =>
                        updateSupplement(index, {
                          billingBasis: event.target
                            .value as RentalSupplement["billingBasis"],
                        })
                      }
                    >
                      <option value="per_day">Per rental day</option>
                      <option value="per_rental">Per rental</option>
                    </RentalSelect>
                  </FieldShell>
                  <FieldShell label="Maximum quantity">
                    <RentalInput
                      type="number"
                      min={1}
                      max={20}
                      value={supplement.maxQuantity}
                      disabled={
                        Boolean(supplement.archivedAt) ||
                        !supplement.quantitySelectable
                      }
                      onChange={(event) =>
                        updateSupplement(index, {
                          maxQuantity: Number(event.target.value),
                        })
                      }
                    />
                  </FieldShell>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-[#e8eaed] pt-3">
                  <label className="flex items-center gap-2 text-[12px] text-[#3c4043]">
                    <Switch
                      checked={supplement.active && !supplement.archivedAt}
                      disabled={Boolean(supplement.archivedAt)}
                      onCheckedChange={(active) =>
                        updateSupplement(index, { active })
                      }
                    />{" "}
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-[#3c4043]">
                    <Switch
                      checked={supplement.quantitySelectable}
                      disabled={Boolean(supplement.archivedAt)}
                      onCheckedChange={(quantitySelectable) =>
                        updateSupplement(index, {
                          quantitySelectable,
                          maxQuantity: quantitySelectable
                            ? Math.max(2, supplement.maxQuantity)
                            : 1,
                        })
                      }
                    />{" "}
                    Customer can choose quantity
                  </label>
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[#ead4d1] px-3 py-2 text-[12px] font-semibold text-[#b3261e] disabled:opacity-40"
                    disabled={Boolean(supplement.archivedAt)}
                    onClick={() =>
                      updateSupplement(index, {
                        active: false,
                        archivedAt: new Date().toISOString(),
                      })
                    }
                  >
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
