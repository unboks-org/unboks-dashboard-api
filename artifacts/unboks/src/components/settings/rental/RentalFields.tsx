import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { formatCents, parseCents } from "@/lib/rental-catalog";

export function FieldShell({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[12px] font-medium text-[#3c4043]">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] text-[#b3261e]">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11px] leading-4 text-[#7a7f87]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function RentalInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-[13px] text-[#202124] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] disabled:bg-[#f1f3f4] disabled:text-[#80868b]",
        props.className,
      )}
    />
  );
}

export function RentalSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-[13px] text-[#202124] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] disabled:bg-[#f1f3f4]",
        props.className,
      )}
    />
  );
}

export function MoneyInput({
  cents,
  onCents,
  disabled,
  ariaLabel,
}: {
  cents: number;
  onCents: (value: number) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-[#5f6368]">
        USD
      </span>
      <RentalInput
        aria-label={ariaLabel}
        inputMode="decimal"
        defaultValue={formatCents(cents)}
        key={cents}
        disabled={disabled}
        onBlur={(event) => {
          const parsed = parseCents(event.target.value);
          if (parsed === null) {
            event.target.value = formatCents(cents);
            return;
          }
          event.target.value = formatCents(parsed);
          onCents(parsed);
        }}
        className="pl-12 tabular-nums"
      />
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e4e7ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-col gap-3 border-b border-[#eef0f3] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h3 className="text-[15px] font-semibold text-[#202124]">{title}</h3>
          {description ? (
            <p className="mt-1 text-[12px] leading-5 text-[#5f6368]">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#1a73e8] px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-[#155fc0] disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#d6dbe3] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#3c4043] transition hover:bg-[#f6f8fc] disabled:cursor-not-allowed disabled:opacity-50";
