import { ArrowDown, ArrowUp, Archive, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type {
  RentalCatalogDocument,
  RentalCar,
  RentalFieldError,
  VehicleCategory,
} from "@/lib/rental-catalog";
import {
  FieldShell,
  MoneyInput,
  RentalInput,
  RentalSelect,
  SectionCard,
  primaryButton,
  secondaryButton,
} from "./RentalFields";
import { RentalMediaField } from "./RentalMediaField";

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((item, displayOrder) => ({ ...item, displayOrder }));
}

export function RentalFleetView({
  document,
  onChange,
  errors,
}: {
  document: RentalCatalogDocument;
  onChange: (document: RentalCatalogDocument) => void;
  errors: RentalFieldError[];
}) {
  const updateCategory = (index: number, patch: Partial<VehicleCategory>) => {
    const categories = document.categories.map((item, current) =>
      current === index ? { ...item, ...patch } : item,
    );
    onChange({ ...document, categories });
  };
  const updateCar = (index: number, patch: Partial<RentalCar>) => {
    const cars = document.cars.map((item, current) =>
      current === index ? { ...item, ...patch } : item,
    );
    onChange({ ...document, cars });
  };
  const errorAt = (path: string) =>
    errors.find((error) => error.path === path)?.message;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Vehicle categories"
        description="Each category owns one fixed daily rate. Cars never override it."
        action={
          <button
            type="button"
            className={secondaryButton}
            onClick={() =>
              onChange({
                ...document,
                categories: [
                  ...document.categories,
                  {
                    id: newId("category"),
                    name: "New category",
                    dailyRateCents: 0,
                    active: true,
                    displayOrder: document.categories.length,
                    archivedAt: null,
                  },
                ],
              })
            }
          >
            <Plus className="h-3.5 w-3.5" /> Add category
          </button>
        }
      >
        {document.categories.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#d6dbe3] p-5 text-center text-[13px] text-[#5f6368]">
            Add the first priced category before adding a car.
          </p>
        ) : (
          <div className="space-y-3">
            {document.categories.map((category, index) => {
              const inUse = document.cars.some(
                (car) => car.active && car.categoryId === category.id,
              );
              return (
                <div
                  key={category.id}
                  className="grid gap-3 rounded-xl border border-[#e8eaed] bg-[#fbfcff] p-3 sm:grid-cols-[minmax(160px,1fr)_180px_auto] sm:items-end"
                >
                  <FieldShell
                    label="Category"
                    error={errorAt(`categories.${index}.name`)}
                  >
                    <RentalInput
                      value={category.name}
                      maxLength={80}
                      disabled={Boolean(category.archivedAt)}
                      onChange={(event) =>
                        updateCategory(index, { name: event.target.value })
                      }
                    />
                  </FieldShell>
                  <FieldShell
                    label="Daily price"
                    error={errorAt(`categories.${index}.dailyRateCents`)}
                  >
                    <MoneyInput
                      cents={category.dailyRateCents}
                      ariaLabel={`${category.name} daily rate`}
                      disabled={Boolean(category.archivedAt)}
                      onCents={(dailyRateCents) =>
                        updateCategory(index, { dailyRateCents })
                      }
                    />
                  </FieldShell>
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                    <label className="flex items-center gap-2 text-[12px] text-[#3c4043]">
                      <Switch
                        checked={category.active && !category.archivedAt}
                        disabled={Boolean(category.archivedAt)}
                        onCheckedChange={(active) =>
                          updateCategory(index, { active })
                        }
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      aria-label={`Move ${category.name} up`}
                      className="rounded-lg border border-[#d6dbe3] p-2 text-[#5f6368] disabled:opacity-30"
                      onClick={() =>
                        onChange({
                          ...document,
                          categories: move(document.categories, index, -1),
                        })
                      }
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${category.name} down`}
                      className="rounded-lg border border-[#d6dbe3] p-2 text-[#5f6368] disabled:opacity-30"
                      onClick={() =>
                        onChange({
                          ...document,
                          categories: move(document.categories, index, 1),
                        })
                      }
                      disabled={index === document.categories.length - 1}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[#ead4d1] p-2 text-[#b3261e] disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label={`Archive ${category.name}`}
                      title={
                        inUse
                          ? "Deactivate its cars before archiving this category."
                          : "Archive category"
                      }
                      disabled={inUse || Boolean(category.archivedAt)}
                      onClick={() =>
                        updateCategory(index, {
                          active: false,
                          archivedAt: new Date().toISOString(),
                        })
                      }
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Customer-facing cars"
        description="One primary image and one price-owning category per car. Deactivation is immediately visible in the next published version only."
        action={
          <button
            type="button"
            className={primaryButton}
            disabled={
              document.categories.filter((item) => !item.archivedAt).length ===
              0
            }
            onClick={() => {
              const category =
                document.categories.find(
                  (item) => item.active && !item.archivedAt,
                ) ?? document.categories.find((item) => !item.archivedAt);
              if (!category) return;
              onChange({
                ...document,
                cars: [
                  ...document.cars,
                  {
                    id: newId("car"),
                    displayName: "New car or similar",
                    categoryId: category.id,
                    seats: 4,
                    transmission: "automatic",
                    primaryImageAssetId: null,
                    active: true,
                    displayOrder: document.cars.length,
                    archivedAt: null,
                  },
                ],
              });
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add car
          </button>
        }
      >
        {document.cars.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#d6dbe3] p-5 text-center text-[13px] text-[#5f6368]">
            No cars in this draft yet.
          </p>
        ) : (
          <div className="space-y-4">
            {document.cars.map((car, index) => (
              <article
                key={car.id}
                className="rounded-xl border border-[#e3e6eb] p-4"
              >
                <div className="grid gap-4 lg:grid-cols-[180px_minmax(180px,1fr)_180px_100px_150px] lg:items-end">
                  <RentalMediaField
                    ownerId={car.id}
                    assetId={car.primaryImageAssetId}
                    onAssetId={(primaryImageAssetId) =>
                      updateCar(index, { primaryImageAssetId })
                    }
                  />
                  <FieldShell
                    label="Car"
                    error={errorAt(`cars.${index}.displayName`)}
                  >
                    <RentalInput
                      value={car.displayName}
                      maxLength={120}
                      disabled={Boolean(car.archivedAt)}
                      onChange={(event) =>
                        updateCar(index, { displayName: event.target.value })
                      }
                    />
                  </FieldShell>
                  <FieldShell
                    label="Category"
                    error={errorAt(`cars.${index}.categoryId`)}
                  >
                    <RentalSelect
                      value={car.categoryId}
                      disabled={Boolean(car.archivedAt)}
                      onChange={(event) =>
                        updateCar(index, { categoryId: event.target.value })
                      }
                    >
                      {document.categories
                        .filter((item) => !item.archivedAt)
                        .map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                    </RentalSelect>
                  </FieldShell>
                  <FieldShell label="Seats">
                    <RentalInput
                      type="number"
                      min={1}
                      max={20}
                      value={car.seats}
                      disabled={Boolean(car.archivedAt)}
                      onChange={(event) =>
                        updateCar(index, { seats: Number(event.target.value) })
                      }
                    />
                  </FieldShell>
                  <FieldShell label="Transmission">
                    <RentalSelect
                      value={car.transmission}
                      disabled={Boolean(car.archivedAt)}
                      onChange={(event) =>
                        updateCar(index, {
                          transmission: event.target
                            .value as RentalCar["transmission"],
                        })
                      }
                    >
                      <option value="automatic">Automatic</option>
                      <option value="manual">Manual</option>
                    </RentalSelect>
                  </FieldShell>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#eef0f3] pt-3">
                  <label className="mr-auto flex items-center gap-2 text-[12px] font-medium text-[#3c4043]">
                    <Switch
                      checked={car.active && !car.archivedAt}
                      disabled={Boolean(car.archivedAt)}
                      onCheckedChange={(active) => updateCar(index, { active })}
                    />
                    {car.active && !car.archivedAt
                      ? "Active for customers"
                      : "Inactive"}
                  </label>
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() =>
                      onChange({
                        ...document,
                        cars: move(document.cars, index, -1),
                      })
                    }
                    disabled={index === 0}
                  >
                    <ArrowUp className="h-3.5 w-3.5" /> Up
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() =>
                      onChange({
                        ...document,
                        cars: move(document.cars, index, 1),
                      })
                    }
                    disabled={index === document.cars.length - 1}
                  >
                    <ArrowDown className="h-3.5 w-3.5" /> Down
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg border border-[#ead4d1] px-3 py-2 text-[12px] font-semibold text-[#b3261e] disabled:opacity-40"
                    disabled={Boolean(car.archivedAt)}
                    onClick={() =>
                      updateCar(index, {
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
