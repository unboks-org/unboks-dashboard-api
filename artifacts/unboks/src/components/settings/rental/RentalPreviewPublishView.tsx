import {
  Download,
  Eye,
  Loader2,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import type {
  RentalCatalogDocument,
  RentalFieldError,
  RentalPreviewResult,
  RentalPreviewScenario,
} from "@/lib/rental-catalog";
import { formatCents } from "@/lib/rental-catalog";
import {
  FieldShell,
  RentalInput,
  RentalSelect,
  SectionCard,
  primaryButton,
  secondaryButton,
} from "./RentalFields";

export function RentalPreviewPublishView({
  document,
  revision,
  currentVersion,
  dirty,
  scenario,
  onScenario,
  preview,
  pdfUrl,
  errors,
  warnings,
  pendingAction,
  onSave,
  onValidate,
  onPreview,
  onPublish,
  onRollback,
}: {
  document: RentalCatalogDocument;
  revision: number;
  currentVersion: number | null;
  dirty: boolean;
  scenario: RentalPreviewScenario;
  onScenario: (scenario: RentalPreviewScenario) => void;
  preview: RentalPreviewResult | null;
  pdfUrl: string | null;
  errors: RentalFieldError[];
  warnings: RentalFieldError[];
  pendingAction: string | null;
  onSave: () => void;
  onValidate: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onRollback: () => void;
}) {
  const activeCars = document.cars.filter(
    (item) => item.active && !item.archivedAt,
  );
  const activeCategories = document.categories.filter(
    (item) => item.active && !item.archivedAt,
  );
  const selectionValue = scenario.carId
    ? `car:${scenario.carId}`
    : scenario.categoryId
      ? `category:${scenario.categoryId}`
      : "";

  return (
    <div className="space-y-5">
      <SectionCard
        title="Synthetic quote scenario"
        description="Preview uses production calculation, customer-caption, and PDF rendering code. It never sends WhatsApp or email."
      >
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#cfe3d7] bg-[#f0f9f3] px-3 py-2.5 text-[12px] text-[#246b3f]">
          <ShieldCheck className="h-4 w-4 flex-none" />
          Safe preview: no customer message, staff email, or operator alert will
          be sent.
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FieldShell label="Rental start">
            <RentalInput
              type="date"
              value={scenario.rentalStart}
              onChange={(event) =>
                onScenario({ ...scenario, rentalStart: event.target.value })
              }
            />
          </FieldShell>
          <FieldShell label="Rental end">
            <RentalInput
              type="date"
              value={scenario.rentalEnd}
              onChange={(event) =>
                onScenario({ ...scenario, rentalEnd: event.target.value })
              }
            />
          </FieldShell>
          <FieldShell label="Car or category">
            <RentalSelect
              value={selectionValue}
              onChange={(event) => {
                const [kind, id] = event.target.value.split(":", 2);
                onScenario({
                  ...scenario,
                  carId: kind === "car" ? id : null,
                  categoryId: kind === "category" ? id : null,
                });
              }}
            >
              <option value="">Choose a published option</option>
              {activeCars.map((car) => (
                <option key={car.id} value={`car:${car.id}`}>
                  {car.displayName}
                </option>
              ))}
              {activeCategories.map((category) => (
                <option key={category.id} value={`category:${category.id}`}>
                  {category.name} category
                </option>
              ))}
            </RentalSelect>
          </FieldShell>
          <FieldShell label="Customer language">
            <RentalSelect
              value={scenario.locale}
              onChange={(event) =>
                onScenario({
                  ...scenario,
                  locale: event.target.value as RentalPreviewScenario["locale"],
                })
              }
            >
              <option value="en">English</option>
              <option value="nl">Dutch</option>
              <option value="pap">Papiamentu</option>
              <option value="de">German</option>
            </RentalSelect>
          </FieldShell>
        </div>
        {document.supplements.filter((item) => item.active && !item.archivedAt)
          .length > 0 ? (
          <div className="mt-4 border-t border-[#eef0f3] pt-4">
            <p className="mb-2 text-[12px] font-medium text-[#3c4043]">
              Supplements
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {document.supplements
                .filter((item) => item.active && !item.archivedAt)
                .map((supplement) => {
                  const selected = scenario.supplements.find(
                    (item) => item.id === supplement.id,
                  );
                  return (
                    <label
                      key={supplement.id}
                      className="flex items-center gap-3 rounded-lg border border-[#e5e7eb] bg-[#fbfcff] p-3"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(selected)}
                        onChange={(event) =>
                          onScenario({
                            ...scenario,
                            supplements: event.target.checked
                              ? [
                                  ...scenario.supplements,
                                  { id: supplement.id, quantity: 1 },
                                ]
                              : scenario.supplements.filter(
                                  (item) => item.id !== supplement.id,
                                ),
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 text-[12px] text-[#202124]">
                        <span className="block font-medium">
                          {supplement.name}
                        </span>
                        <span className="text-[#5f6368]">
                          USD {formatCents(supplement.priceCents)}{" "}
                          {supplement.billingBasis === "per_day"
                            ? "/ day"
                            : "/ rental"}
                        </span>
                      </span>
                      {selected && supplement.quantitySelectable ? (
                        <RentalInput
                          aria-label={`${supplement.name} quantity`}
                          type="number"
                          min={1}
                          max={supplement.maxQuantity}
                          value={selected.quantity}
                          onChange={(event) =>
                            onScenario({
                              ...scenario,
                              supplements: scenario.supplements.map((item) =>
                                item.id === supplement.id
                                  ? {
                                      ...item,
                                      quantity: Number(event.target.value),
                                    }
                                  : item,
                              ),
                            })
                          }
                          className="w-20"
                        />
                      ) : null}
                    </label>
                  );
                })}
            </div>
          </div>
        ) : null}
      </SectionCard>

      {errors.length > 0 || warnings.length > 0 ? (
        <section
          className="rounded-xl border border-[#f0cfcb] bg-[#fff8f7] p-4"
          aria-live="polite"
        >
          <h3 className="text-[13px] font-semibold text-[#8c1d18]">
            Catalog needs attention
          </h3>
          <ul className="mt-2 space-y-1 text-[12px] text-[#6f2a25]">
            {[...errors, ...warnings].map((item, index) => (
              <li key={`${item.path}-${item.code}-${index}`}>
                <strong>{item.path || "Catalog"}:</strong> {item.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SectionCard
        title="Draft and publication"
        description={`Draft revision ${revision} · ${currentVersion ? `Published version ${currentVersion}` : "Nothing published yet"}`}
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={secondaryButton}
            onClick={onSave}
            disabled={!dirty || Boolean(pendingAction)}
          >
            {pendingAction === "save" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}{" "}
            Save draft
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={onValidate}
            disabled={Boolean(pendingAction)}
          >
            {pendingAction === "validate" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}{" "}
            Validate
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={onPreview}
            disabled={Boolean(pendingAction) || !selectionValue}
          >
            {pendingAction === "preview" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}{" "}
            Preview quote
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={onPublish}
            disabled={Boolean(pendingAction)}
          >
            {pendingAction === "publish" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}{" "}
            Publish
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={onRollback}
            disabled={
              Boolean(pendingAction) || !currentVersion || currentVersion < 2
            }
          >
            {pendingAction === "rollback" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}{" "}
            Undo last publication
          </button>
        </div>
      </SectionCard>

      {preview ? (
        <SectionCard
          title="Exact customer preview"
          description={`Rental ${preview.quote.rentalDays} day(s) · PDF ${(preview.pdfBytes / 1024).toFixed(1)} KB · no delivery attempted`}
          action={
            pdfUrl ? (
              <a
                href={pdfUrl}
                download="rental-quote-preview.pdf"
                className={secondaryButton}
              >
                <Download className="h-3.5 w-3.5" /> Download PDF
              </a>
            ) : null
          }
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5f6368]">
                WhatsApp text
              </h4>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-[#f5f7fa] p-4 font-sans text-[12px] leading-5 text-[#202124]">
                {preview.customerWhatsAppText}
              </pre>
              <div className="mt-4 overflow-x-auto rounded-xl border border-[#e5e7eb]">
                <table className="w-full min-w-[460px] text-left text-[12px]">
                  <thead className="bg-[#f5f7fa] text-[#5f6368]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Charge</th>
                      <th className="px-3 py-2 font-semibold">Quantity</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Unit price
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.quote.items.map((item) => (
                      <tr
                        key={`${item.kind}-${item.id}`}
                        className="border-t border-[#eef0f3]"
                      >
                        <td className="px-3 py-2 font-medium text-[#202124]">
                          {item.name}
                          {item.billingBasis ? (
                            <span className="ml-1 font-normal text-[#7a7f87]">
                              (
                              {item.billingBasis === "per_day"
                                ? "per day"
                                : "per rental"}
                              )
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-[#5f6368]">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          USD {formatCents(item.unitPriceCents)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          USD {formatCents(item.subtotalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
                <dt className="text-[#5f6368]">Rental charges</dt>
                <dd className="text-right font-semibold">
                  USD {formatCents(preview.quote.rentalTotalCents)}
                </dd>
                <dt className="text-[#5f6368]">Refundable deposit</dt>
                <dd className="text-right font-semibold">
                  USD{" "}
                  {formatCents(preview.quote.refundableSecurityDepositCents)}
                </dd>
                <dt className="border-t border-[#e5e7eb] pt-2 font-semibold">
                  Grand total
                </dt>
                <dd className="border-t border-[#e5e7eb] pt-2 text-right font-bold">
                  USD {formatCents(preview.quote.grandTotalCents)}
                </dd>
              </dl>
            </div>
            <div className="min-h-[420px] overflow-hidden rounded-xl border border-[#dfe3e8] bg-[#f1f3f4]">
              {pdfUrl ? (
                <iframe
                  title="Rental quote PDF preview"
                  src={pdfUrl}
                  className="h-[520px] w-full"
                />
              ) : (
                <div className="grid h-[420px] place-items-center text-[12px] text-[#5f6368]">
                  Loading PDF preview…
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
