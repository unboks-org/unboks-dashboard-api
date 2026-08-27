import type {
  RentalCatalogDocument,
  RentalFieldError,
} from "@/lib/rental-catalog";
import { FieldShell, RentalInput, SectionCard } from "./RentalFields";
import { RentalMediaField } from "./RentalMediaField";

export function RentalQuoteSettingsView({
  document,
  onChange,
  errors,
}: {
  document: RentalCatalogDocument;
  onChange: (document: RentalCatalogDocument) => void;
  errors: RentalFieldError[];
}) {
  const settings = document.settings;
  const update = (patch: Partial<RentalCatalogDocument["settings"]>) =>
    onChange({
      ...document,
      settings: { ...settings, ...patch },
    });
  const errorAt = (path: string) =>
    errors.find((error) => error.path === path)?.message;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Quote behavior"
        description="These values are copied into every new immutable quote snapshot."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell
            label="Currency"
            hint="One ISO currency per rental tenant."
          >
            <RentalInput
              value={settings.currency}
              disabled
              aria-label="Currency"
            />
          </FieldShell>
          <FieldShell
            label="Availability mode"
            hint="P0 remains request-only; staff confirms availability."
          >
            <RentalInput
              value="Request only"
              disabled
              aria-label="Availability mode"
            />
          </FieldShell>
          <FieldShell
            label="Quote validity (hours)"
            error={errorAt("settings.quoteValidityHours")}
          >
            <RentalInput
              type="number"
              min={1}
              max={720}
              value={settings.quoteValidityHours}
              onChange={(event) =>
                update({ quoteValidityHours: Number(event.target.value) })
              }
            />
          </FieldShell>
          <FieldShell
            label="Customer delivery delay (seconds)"
            error={errorAt("settings.customerDeliveryDelaySeconds")}
          >
            <RentalInput
              type="number"
              min={0}
              max={1800}
              value={settings.customerDeliveryDelaySeconds}
              onChange={(event) =>
                update({
                  customerDeliveryDelaySeconds: Number(event.target.value),
                })
              }
            />
          </FieldShell>
          <FieldShell
            label="Staff quote email"
            error={errorAt("settings.staffQuoteEmail")}
          >
            <RentalInput
              type="email"
              value={settings.staffQuoteEmail}
              onChange={(event) =>
                update({ staffQuoteEmail: event.target.value })
              }
            />
          </FieldShell>
          <FieldShell
            label="Reservation deposit"
            hint="Preserved for compatibility; this is not changed by FRD-005."
          >
            <RentalInput
              value={`${settings.reservationDepositPercent}% of rental charges`}
              disabled
            />
          </FieldShell>
        </div>
      </SectionCard>

      <SectionCard
        title="Customer document copy"
        description="Plain text only. The PDF renderer escapes operator-controlled content."
      >
        <div className="space-y-4">
          <FieldShell
            label="Availability statement"
            error={errorAt("settings.availabilityCopy")}
          >
            <textarea
              value={settings.availabilityCopy}
              maxLength={240}
              rows={3}
              onChange={(event) =>
                update({ availabilityCopy: event.target.value })
              }
              className="w-full resize-y rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-[13px] leading-5 text-[#202124] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
            />
          </FieldShell>
          <FieldShell
            label="Quote footer"
            hint="Optional, up to 500 characters."
            error={errorAt("settings.quoteFooter")}
          >
            <textarea
              value={settings.quoteFooter}
              maxLength={500}
              rows={4}
              onChange={(event) => update({ quoteFooter: event.target.value })}
              className="w-full resize-y rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-[13px] leading-5 text-[#202124] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
            />
          </FieldShell>
        </div>
      </SectionCard>

      <SectionCard
        title="PDF brand image"
        description="Optional tenant-owned logo for new quote PDFs. When absent, the workspace default remains in use."
      >
        <div className="max-w-sm">
          <FieldShell
            label="Quote logo"
            hint="JPG, PNG, or WebP; one tenant-owned image."
          >
            <RentalMediaField
              ownerId="rental-quote-logo"
              assetId={settings.pdfLogoAssetId}
              caption="Rental quote PDF logo"
              alt="Quote logo preview"
              onAssetId={(pdfLogoAssetId) => update({ pdfLogoAssetId })}
            />
          </FieldShell>
        </div>
      </SectionCard>
    </div>
  );
}
