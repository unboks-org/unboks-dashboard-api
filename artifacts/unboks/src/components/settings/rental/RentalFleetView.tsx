import type { ComponentType } from "react";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  BriefcaseBusiness,
  CarFront,
  ChevronDown,
  Gauge,
  Minus,
  MoreHorizontal,
  Plus,
  Tag,
  Settings2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
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

function VehicleNumberField({
  label,
  hint,
  icon: Icon,
  value,
  min,
  max,
  disabled,
  error,
  onValue,
}: {
  label: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  error?: string;
  onValue: (value: number) => void;
}) {
  const updateWithinRange = (next: number) =>
    onValue(Math.min(max, Math.max(min, next)));

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#667085]">
          {label}
        </span>
        {hint ? (
          <span className="truncate text-[10px] text-[#98a2b3]">{hint}</span>
        ) : null}
      </div>
      <div
        className={cn(
          "flex h-12 min-w-0 items-center overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition focus-within:border-[#9b7b27] focus-within:ring-2 focus-within:ring-[#9b7b27]/10",
          error ? "border-[#d92d20]" : "border-[#dfe3e8]",
        )}
      >
        <span className="grid h-full w-11 flex-none place-items-center border-r border-[#edf0f3] bg-[#fcfcfd] text-[#80651d]">
          <Icon className="h-4 w-4" />
        </span>
        <Input
          type="number"
          aria-label={label}
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          className="h-11 min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent px-2 text-center text-[14px] font-semibold text-[#172033] shadow-none focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isFinite(next)) updateWithinRange(next);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="h-11 w-11 flex-none rounded-none border-l border-[#edf0f3] text-[#667085]"
          disabled={disabled || value <= min}
          onClick={() => updateWithinRange(value - 1)}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Increase ${label.toLowerCase()}`}
          className="h-11 w-11 flex-none rounded-none border-l border-[#edf0f3] text-[#667085]"
          disabled={disabled || value >= max}
          onClick={() => updateWithinRange(value + 1)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {error ? (
        <p className="mt-1.5 text-[11px] text-[#b42318]">{error}</p>
      ) : null}
    </div>
  );
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
              const nameError = errorAt(`cars.${index}.displayName`);
              const categoryError = errorAt(`cars.${index}.categoryId`);
              const luggageError = errorAt(
                `cars.${index}.luggageCapacity`,
              );

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

                    <div className="min-w-0 rounded-2xl bg-[#f8fafc] p-4 ring-1 ring-inset ring-[#e9edf2] sm:p-5">
                      <div className="flex items-center gap-3 border-b border-[#e6eaf0] pb-4">
                        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-white text-[#80651d] shadow-sm ring-1 ring-[#e3e7ec]">
                          <Settings2 className="h-4 w-4" />
                        </span>
                        <div>
                          <h5 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#475467]">
                            Vehicle details
                          </h5>
                          <p className="mt-0.5 text-[11px] text-[#98a2b3]">
                            Information customers use to compare this car
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
                        <div className="min-w-0">
                          <label
                            htmlFor={`car-name-${car.id}`}
                            className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#667085]"
                          >
                            Customer-facing name
                          </label>
                          <div className="relative">
                            <CarFront className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#80651d]" />
                            <Input
                              id={`car-name-${car.id}`}
                              value={car.displayName}
                              maxLength={120}
                              disabled={Boolean(car.archivedAt)}
                              aria-invalid={Boolean(nameError)}
                              className="h-12 rounded-xl border-[#dfe3e8] bg-white pl-10 pr-3 text-[13px] font-medium text-[#172033] shadow-[0_1px_2px_rgba(16,24,40,0.04)] focus-visible:border-[#9b7b27] focus-visible:ring-[#9b7b27]/15"
                              onChange={(event) =>
                                updateCar(index, {
                                  displayName: event.target.value,
                                })
                              }
                            />
                          </div>
                          {nameError ? (
                            <p className="mt-1.5 text-[11px] text-[#b42318]">
                              {nameError}
                            </p>
                          ) : null}
                        </div>

                        <div className="min-w-0">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <label
                              htmlFor={`car-category-${car.id}`}
                              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#667085]"
                            >
                              Rate category
                            </label>
                            {category ? (
                              <span className="truncate text-[10px] font-semibold text-[#80651d]">
                                USD {formatCents(category.dailyRateCents)} / day
                              </span>
                            ) : null}
                          </div>
                          <div className="relative">
                            <Tag className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#80651d]" />
                            <RentalSelect
                              id={`car-category-${car.id}`}
                              value={car.categoryId}
                              disabled={Boolean(car.archivedAt)}
                              aria-invalid={Boolean(categoryError)}
                              className="h-12 appearance-none rounded-xl border-[#dfe3e8] bg-white pl-10 pr-10 text-[13px] font-semibold text-[#172033] shadow-[0_1px_2px_rgba(16,24,40,0.04)] focus:border-[#9b7b27] focus:ring-[#9b7b27]/15"
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
                            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]" />
                          </div>
                          {categoryError ? (
                            <p className="mt-1.5 text-[11px] text-[#b42318]">
                              {categoryError}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-3">
                        <VehicleNumberField
                          label="Seats"
                          icon={Users}
                          value={car.seats}
                          min={1}
                          max={20}
                          disabled={Boolean(car.archivedAt)}
                          onValue={(seats) => updateCar(index, { seats })}
                        />
                        <VehicleNumberField
                          label="Suitcases"
                          hint="Medium bags"
                          icon={BriefcaseBusiness}
                          value={car.luggageCapacity ?? 0}
                          min={0}
                          max={20}
                          disabled={Boolean(car.archivedAt)}
                          error={luggageError}
                          onValue={(luggageCapacity) =>
                            updateCar(index, { luggageCapacity })
                          }
                        />
                        <div className="min-w-0">
                          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#667085]">
                            Transmission
                          </span>
                          <div
                            role="group"
                            aria-label="Transmission"
                            className="grid h-14 grid-cols-2 gap-1 rounded-xl border border-[#dfe3e8] bg-white p-1 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                          >
                            {(["automatic", "manual"] as const).map(
                              (transmission) => {
                                const selected =
                                  car.transmission === transmission;
                                return (
                                  <button
                                    key={transmission}
                                    type="button"
                                    aria-pressed={selected}
                                    disabled={Boolean(car.archivedAt)}
                                    onClick={() =>
                                      updateCar(index, { transmission })
                                    }
                                    className={cn(
                                      "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b7b27]/30 disabled:opacity-50",
                                      selected
                                        ? "bg-[#172033] text-white shadow-sm"
                                        : "text-[#667085] hover:bg-[#f5f7fa]",
                                    )}
                                  >
                                    {selected ? (
                                      <Gauge className="h-3.5 w-3.5 flex-none" />
                                    ) : null}
                                    <span className="truncate">
                                      {transmission === "automatic"
                                        ? "Automatic"
                                        : "Manual"}
                                    </span>
                                  </button>
                                );
                              },
                            )}
                          </div>
                        </div>
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
