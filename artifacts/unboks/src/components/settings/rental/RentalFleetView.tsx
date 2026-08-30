import {
  ArrowDown,
  ArrowUp,
  Archive,
  BriefcaseBusiness,
  CarFront,
  MoreHorizontal,
  Plus,
  Settings2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  formatCents,
  type RentalCatalogDocument,
  type RentalCar,
  type RentalFieldError,
  type VehicleCategory,
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

/*
 * Keep vehicle merchandising and catalog mutations together: this editor is
 * reused by every rental tenant while the server remains the source of truth
 * for pricing, publishing and customer eligibility.
 */

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
                    luggageCapacity: 2,
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
            {document.cars.map((car, index) => {
              const category = document.categories.find(
                (item) => item.id === car.categoryId,
              );
              const isActive = car.active && !car.archivedAt;

              return (
                <article
                  key={car.id}
                  className="overflow-hidden rounded-2xl border border-[#dfe3e8] bg-white shadow-[0_8px_24px_rgba(23,32,51,0.06)] transition-shadow hover:shadow-[0_12px_30px_rgba(23,32,51,0.09)]"
                >
                  <header className="flex min-w-0 items-start gap-3 border-b border-[#edf0f3] bg-[#fcfcfd] px-4 py-4 sm:items-center sm:px-5">
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[#f2ead4] text-[#80651d]">
                      <CarFront className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-[15px] font-semibold text-[#172033] sm:text-[16px]">
                          {car.displayName || "Untitled vehicle"}
                        </h4>
                        <Badge
                          variant="outline"
                          className={
                            isActive
                              ? "border-[#bce5d1] bg-[#effaf4] text-[#176b45]"
                              : "border-[#dfe3e8] bg-[#f6f7f9] text-[#667085]"
                          }
                        >
                          {isActive ? "Live" : "Hidden"}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-[12px] text-[#667085]">
                        {category?.name ?? "Category not selected"}
                        {category
                          ? ` · USD ${formatCents(category.dailyRateCents)} / day`
                          : ""}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`More actions for ${car.displayName}`}
                          className="h-11 w-11 flex-none rounded-lg text-[#667085]"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          disabled={index === 0}
                          onSelect={() =>
                            onChange({
                              ...document,
                              cars: move(document.cars, index, -1),
                            })
                          }
                        >
                          <ArrowUp /> Move earlier
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={index === document.cars.length - 1}
                          onSelect={() =>
                            onChange({
                              ...document,
                              cars: move(document.cars, index, 1),
                            })
                          }
                        >
                          <ArrowDown /> Move later
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={Boolean(car.archivedAt)}
                          className="text-[#b42318] focus:text-[#b42318]"
                          onSelect={() =>
                            updateCar(index, {
                              active: false,
                              archivedAt: new Date().toISOString(),
                            })
                          }
                        >
                          <Archive /> Archive vehicle
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </header>

                  <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:gap-6">
                    <RentalMediaField
                      ownerId={car.id}
                      assetId={car.primaryImageAssetId}
                      presentation="vehicle"
                      alt={`${car.displayName} customer-facing photo`}
                      onAssetId={(primaryImageAssetId) =>
                        updateCar(index, { primaryImageAssetId })
                      }
                    />

                    <div className="min-w-0 space-y-5">
                      <div className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4 text-[#80651d]" />
                        <h5 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#667085]">
                          Vehicle details
                        </h5>
                      </div>
                      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                        <FieldShell
                          label="Customer-facing name"
                          error={errorAt(`cars.${index}.displayName`)}
                        >
                          <RentalInput
                            value={car.displayName}
                            maxLength={120}
                            disabled={Boolean(car.archivedAt)}
                            onChange={(event) =>
                              updateCar(index, {
                                displayName: event.target.value,
                              })
                            }
                          />
                        </FieldShell>
                        <FieldShell
                          label="Rate category"
                          error={errorAt(`cars.${index}.categoryId`)}
                        >
                          <RentalSelect
                            value={car.categoryId}
                            disabled={Boolean(car.archivedAt)}
                            onChange={(event) =>
                              updateCar(index, {
                                categoryId: event.target.value,
                              })
                            }
                          >
                            {document.categories
                              .filter((item) => !item.archivedAt)
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                          </RentalSelect>
                        </FieldShell>
                      </div>
                      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
                        <FieldShell label="Seats">
                          <div className="relative">
                            <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
                            <RentalInput
                              type="number"
                              min={1}
                              max={20}
                              value={car.seats}
                              className="pl-9"
                              disabled={Boolean(car.archivedAt)}
                              onChange={(event) =>
                                updateCar(index, {
                                  seats: Number(event.target.value),
                                })
                              }
                            />
                          </div>
                        </FieldShell>
                        <FieldShell
                          label="Suitcases"
                          hint="Approximate medium bags"
                          error={errorAt(`cars.${index}.luggageCapacity`)}
                        >
                          <div className="relative">
                            <BriefcaseBusiness className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
                            <RentalInput
                              type="number"
                              min={0}
                              max={20}
                              value={car.luggageCapacity ?? 0}
                              className="pl-9"
                              disabled={Boolean(car.archivedAt)}
                              onChange={(event) =>
                                updateCar(index, {
                                  luggageCapacity: Number(event.target.value),
                                })
                              }
                            />
                          </div>
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
                    </div>
                  </div>

                  <footer className="flex flex-col gap-3 border-t border-[#edf0f3] bg-[#fcfcfd] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[#344054]">
                        Customer visibility
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-[#667085]">
                        {isActive
                          ? "Customers can see and choose this vehicle after publishing."
                          : "This vehicle is excluded from customer recommendations."
                        }
                      </p>
                    </div>
                    <label className="flex min-h-11 flex-none cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#e1e5ea] bg-white px-3.5 py-2 sm:justify-start">
                      <span className="text-[12px] font-semibold text-[#344054]">
                        {isActive ? "Visible" : "Hidden"}
                      </span>
                      <Switch
                        aria-label={`Show ${car.displayName} to customers`}
                        checked={isActive}
                        disabled={Boolean(car.archivedAt)}
                        onCheckedChange={(active) => updateCar(index, { active })}
                      />
                    </label>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
