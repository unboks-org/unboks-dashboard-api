import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useDataRetentionSettings,
  ACTIVE_INBOX_OPTIONS,
  ARCHIVE_RETENTION_OPTIONS,
  END_OF_RETENTION_OPTIONS,
  AUDIT_LOG_OPTIONS,
  type DataRetentionSettings,
  type ActiveInboxArchiveAfterDays,
  type ArchiveRetentionMonths,
  type EndOfRetentionAction,
  type AuditLogRetentionMonths,
} from "@/hooks/use-data-retention-settings";
import { getTenantUiConfig, tenantText } from "@/lib/tenant-ui";

/**
 * Compact "Data retention & archive" settings section.
 *
 * Design references checked on Refero before building (web, settings genre):
 *   - Canva permissions/integrations settings (compact rows + right-aligned
 *     controls)
 *   - Coinbase privacy-rights settings (retention/anonymize phrasing)
 *   - Revolut privacy settings (dense list with helper text)
 *   - Airtable workspace settings (single card, divided rows)
 *   - X.com notification settings (label + control row pattern)
 * The card uses one container with divided rows, no marketing whitespace,
 * and right-aligned dropdowns that wrap below the label on narrow screens.
 *
 * Backend status: there is no PUT endpoint yet. We persist locally and tell
 * the operator honestly that automation will be wired by the Unboks team.
 */

// Render a label string for a saved value by looking it up in the option
// list. Falls back to a safe placeholder if the value isn't matched.
function labelFor<T>(options: { value: T; label: string }[], value: T): string {
  const label = options.find((o) => o.value === value)?.label ??
    tenantText("Not set", "Sin definir");
  return retentionOptionLabel(label);
}

function retentionOptionLabel(label: string): string {
  if (/^\d+ days$/.test(label)) return tenantText(label, label.replace(" days", " días"));
  if (/^\d+ months$/.test(label)) return tenantText(label, label.replace(" months", " meses"));
  if (label === "5 years") return tenantText(label, "5 años");
  if (label === "Never automatically archive") {
    return tenantText(label, "No archivar nunca automáticamente");
  }
  if (label === "Never delete automatically") {
    return tenantText(label, "No eliminar nunca automáticamente");
  }
  if (label === "Would anonymize customer data") {
    return tenantText(label, "Anonimizaría los datos del contacto");
  }
  if (label === "Would delete messages permanently") {
    return tenantText(label, "Eliminaría los mensajes de forma permanente");
  }
  if (label === "Would keep forever") return tenantText(label, "Los conservaría para siempre");
  return label;
}

// Convert select string back to the typed value (handles "null" and numeric
// strings; "anonymize"/"delete"/"keep" pass through as-is).
function parseActiveInbox(raw: string): ActiveInboxArchiveAfterDays {
  if (raw === "null") return null;
  const n = Number(raw);
  return n === 30 || n === 60 || n === 90 || n === 180 ? n : 90;
}
function parseArchive(raw: string): ArchiveRetentionMonths {
  if (raw === "null") return null;
  const n = Number(raw);
  return n === 12 || n === 24 || n === 36 || n === 60 ? n : 24;
}
function parseEndAction(raw: string): EndOfRetentionAction {
  return raw === "delete" || raw === "keep" ? raw : "anonymize";
}
function parseAudit(raw: string): AuditLogRetentionMonths {
  const n = Number(raw);
  return n === 12 || n === 36 || n === 60 ? n : 24;
}

/** A compact label + helper-text + control row. The control wraps below
 *  the label on narrow screens via `flex-wrap`, so the dropdown never
 *  forces horizontal overflow. */
function Row({
  label,
  helper,
  htmlFor,
  control,
  divider = true,
}: {
  label: string;
  helper?: string;
  htmlFor?: string;
  control: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap sm:items-center sm:px-5",
        divider && "border-t border-[#f1f3f4]",
      )}
    >
      <div className="min-w-0 flex-1">
        <label
          htmlFor={htmlFor}
          className="block text-[13.5px] font-medium text-[#202124]"
        >
          {label}
        </label>
        {helper && (
          <p className="mt-0.5 text-[12px] leading-snug text-[#5f6368]">{helper}</p>
        )}
      </div>
      <div className="w-full max-w-full min-w-0 sm:w-auto sm:max-w-[260px] sm:flex-shrink-0">
        {control}
      </div>
    </div>
  );
}

/** Native `<select>` styled to match the rest of the Settings surface.
 *  Native is the right pick here — keyboard/screen-reader/mobile behavior
 *  is correct for free, and the visual remains compact. */
function Select({
  id,
  value,
  onChange,
  children,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "h-9 w-full min-w-0 cursor-pointer appearance-none rounded-lg border border-[#dadce0] bg-white pl-3 pr-9 text-[13px] text-[#202124] outline-none transition-colors",
          "hover:border-[#bdc1c6] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]",
          "disabled:cursor-not-allowed disabled:bg-[#f8f9fa] disabled:text-[#80868b]",
        )}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f6368]"
        aria-hidden
      />
    </div>
  );
}

export function DataRetentionSettings() {
  const { settings, save } = useDataRetentionSettings();
  const [draft, setDraft] = useState<DataRetentionSettings>(settings);
  const [savedFlash, setSavedFlash] = useState(false);

  // Reset draft if the underlying settings change (e.g. cross-tab sync).
  // We deliberately do NOT track every keystroke — `useState(settings)`
  // captures the initial value, the storage event handler in the hook will
  // re-render, but we want unsaved edits to survive that. So we only sync
  // when there are no in-flight changes, i.e. draft equals settings.
  useMemoSync(settings, draft, setDraft);

  const dirty = useMemo(() => {
    return (
      draft.activeInboxArchiveAfterDays !== settings.activeInboxArchiveAfterDays ||
      draft.archiveRetentionMonths !== settings.archiveRetentionMonths ||
      draft.endOfRetentionAction !== settings.endOfRetentionAction ||
      draft.keepApprovedLearnings !== settings.keepApprovedLearnings ||
      draft.auditLogRetentionMonths !== settings.auditLogRetentionMonths
    );
  }, [draft, settings]);

  const handleSave = () => {
    save(draft);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2200);
    toast.success(
      tenantText(
        "Saved as a local preference only. No cleanup automation is active yet.",
        "Guardado solo como preferencia local. La limpieza automática aún no está activa.",
      ),
    );
  };

  // Honest status string: until the backend reports policyActive, we
  // display "Saved locally" so the operator never assumes automation is
  // running on their data.
  const policyLine = settings.status?.policyActive
    ? tenantText("Active", "Activa")
    : tenantText(
        "Not active yet (local preference only)",
        "Aún no está activa (solo preferencia local)",
      );
  const nextCleanup = settings.status?.nextCleanupAt
    ? new Date(settings.status.nextCleanupAt).toLocaleString(getTenantUiConfig().dateLocale)
    : tenantText("Not scheduled yet", "Aún no programada");

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white">
      <header className="border-b border-[#f1f3f4] px-5 py-4 sm:px-6">
        <h3 className="text-[14px] font-semibold text-[#202124]">
          {tenantText("Data retention preferences", "Preferencias de conservación de datos")}
        </h3>
        <p className="mt-0.5 text-[13px] text-[#5f6368]">
          {tenantText(
            "Prepare retention preferences for future automation.",
            "Prepara las preferencias de conservación para una futura automatización.",
          )}
        </p>
      </header>

      <div>
        <div className="border-b border-[#f1f3f4] bg-[#fff8e1] px-4 py-3 text-[12.5px] leading-snug text-[#5f4b00] sm:px-5">
          <p className="font-semibold text-[#3c4043]">
            {tenantText(
              "Not active yet: automatic archive, delete, and anonymize jobs are not running.",
              "Aún no está activo: las tareas automáticas de archivo, eliminación y anonimización no se están ejecutando.",
            )}
          </p>
          <p className="mt-1">
            {tenantText(
              "These choices are saved on this browser as preferences only. Manual Inbox archive and unarchive actions still work normally.",
              "Estas opciones solo se guardan como preferencias en este navegador. Las acciones manuales de archivar y desarchivar siguen funcionando con normalidad.",
            )}
          </p>
        </div>
        <Row
          label={tenantText(
            "Archive inactive conversations after",
            "Archivar conversaciones inactivas después de",
          )}
          helper={tenantText(
            "Future preference only. This does not automatically move conversations today.",
            "Solo es una preferencia futura. Hoy no mueve conversaciones automáticamente.",
          )}
          htmlFor="dr-active-inbox"
          divider={false}
          control={
            <Select
              id="dr-active-inbox"
              value={String(draft.activeInboxArchiveAfterDays)}
              onChange={(v) =>
                setDraft({ ...draft, activeInboxArchiveAfterDays: parseActiveInbox(v) })
              }
            >
              {ACTIVE_INBOX_OPTIONS.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {retentionOptionLabel(o.label)}
                </option>
              ))}
            </Select>
          }
        />
        <Row
          label={tenantText(
            "Keep archived conversations for",
            "Conservar las conversaciones archivadas durante",
          )}
          helper={tenantText(
            "Future preference only. No automatic deletion currently runs.",
            "Solo es una preferencia futura. Actualmente no se ejecuta ninguna eliminación automática.",
          )}
          htmlFor="dr-archive-retention"
          control={
            <Select
              id="dr-archive-retention"
              value={String(draft.archiveRetentionMonths)}
              onChange={(v) =>
                setDraft({ ...draft, archiveRetentionMonths: parseArchive(v) })
              }
            >
              {ARCHIVE_RETENTION_OPTIONS.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {retentionOptionLabel(o.label)}
                </option>
              ))}
            </Select>
          }
        />
        <Row
          label={tenantText("After the archive period", "Después del periodo de archivo")}
          helper={tenantText(
            "Future preference only. This does not delete or anonymize data yet.",
            "Solo es una preferencia futura. Todavía no elimina ni anonimiza datos.",
          )}
          htmlFor="dr-end-action"
          control={
            <Select
              id="dr-end-action"
              value={draft.endOfRetentionAction}
              onChange={(v) =>
                setDraft({ ...draft, endOfRetentionAction: parseEndAction(v) })
              }
            >
              {END_OF_RETENTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {retentionOptionLabel(o.label)}
                </option>
              ))}
            </Select>
          }
        />
        <Row
          label={tenantText(
            "Keep approved Agent answers after archive or delete",
            "Conservar las respuestas aprobadas del agente después de archivar o eliminar",
          )}
          helper={tenantText(
            "Future preference only. Approved answers are not changed by this control today.",
            "Solo es una preferencia futura. Este control no modifica hoy las respuestas aprobadas.",
          )}
          htmlFor="dr-keep-learnings"
          control={
            <label
              htmlFor="dr-keep-learnings"
              className="inline-flex cursor-pointer select-none items-center gap-2 text-[13px] text-[#202124]"
            >
              <input
                id="dr-keep-learnings"
                type="checkbox"
                checked={draft.keepApprovedLearnings}
                onChange={(e) =>
                  setDraft({ ...draft, keepApprovedLearnings: e.target.checked })
                }
                className="h-4 w-4 cursor-pointer rounded border-[#dadce0] text-[#1a73e8] focus:ring-[#1a73e8]"
              />
              <span>
                {draft.keepApprovedLearnings
                  ? tenantText("On", "Activado")
                  : tenantText("Off", "Desactivado")}
              </span>
            </label>
          }
        />
        <Row
          label={tenantText(
            "Keep escalation and audit logs for",
            "Conservar los registros de seguimiento y auditoría durante",
          )}
          helper={tenantText(
            "Future preference only. Audit log cleanup is not automated yet.",
            "Solo es una preferencia futura. La limpieza de los registros de auditoría aún no está automatizada.",
          )}
          htmlFor="dr-audit-logs"
          control={
            <Select
              id="dr-audit-logs"
              value={String(draft.auditLogRetentionMonths)}
              onChange={(v) =>
                setDraft({ ...draft, auditLogRetentionMonths: parseAudit(v) })
              }
            >
              {AUDIT_LOG_OPTIONS.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {retentionOptionLabel(o.label)}
                </option>
              ))}
            </Select>
          }
        />

        <div className="border-t border-[#f1f3f4] bg-[#fafbfc] px-4 py-3 text-[12px] text-[#5f6368] sm:px-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span>
              {tenantText("Retention policy", "Política de conservación")}:{" "}
              <span className="font-medium text-[#3c4043]">{policyLine}</span>
            </span>
            <span>
              {tenantText("Next cleanup", "Próxima limpieza")}:{" "}
              <span className="font-medium text-[#3c4043]">{nextCleanup}</span>
            </span>
          </div>
          <p className="mt-1.5">
            {tenantText(
              "Local preference only. No automatic retention, deletion, or anonymization is enforced until backend automation is connected.",
              "Solo es una preferencia local. No se aplica ninguna conservación, eliminación o anonimización automática hasta que se conecte la automatización del servidor.",
            )}
          </p>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f1f3f4] bg-[#fafbfc] px-4 py-3 sm:px-5">
        <div className="text-[12px] text-[#5f6368]">
          <p className="font-medium text-[#3c4043]">
            {tenantText("Saved local preferences", "Preferencias locales guardadas")}
          </p>
          <p>
            {labelFor(ACTIVE_INBOX_OPTIONS, settings.activeInboxArchiveAfterDays)} ·{" "}
            {labelFor(ARCHIVE_RETENTION_OPTIONS, settings.archiveRetentionMonths)} ·{" "}
            {labelFor(END_OF_RETENTION_OPTIONS, settings.endOfRetentionAction)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "text-[12px] text-[#137333] transition-opacity duration-200",
              savedFlash ? "opacity-100" : "opacity-0",
            )}
            aria-live="polite"
          >
            {tenantText("Saved", "Guardado")}
          </span>
          <button
            type="button"
            disabled={!dirty}
            onClick={handleSave}
            className={cn(
              "rounded-lg bg-[#1a73e8] px-4 py-2 text-[13px] font-medium text-white transition-colors",
              "hover:bg-[#1765c1] disabled:cursor-not-allowed disabled:bg-[#c8d4e6]",
            )}
          >
            {tenantText("Save local preference", "Guardar preferencia local")}
          </button>
        </div>
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Sync the draft back to the latest persisted settings whenever the
 *  saved value changes AND the user has no unsaved edits in flight. This
 *  keeps cross-tab updates visible without nuking a half-typed change in
 *  the current tab. */
function useMemoSync(
  settings: DataRetentionSettings,
  draft: DataRetentionSettings,
  setDraft: (next: DataRetentionSettings) => void,
) {
  const prevSettings = useRef(settings);
  useEffect(() => {
    const same =
      draft.activeInboxArchiveAfterDays === prevSettings.current.activeInboxArchiveAfterDays &&
      draft.archiveRetentionMonths === prevSettings.current.archiveRetentionMonths &&
      draft.endOfRetentionAction === prevSettings.current.endOfRetentionAction &&
      draft.keepApprovedLearnings === prevSettings.current.keepApprovedLearnings &&
      draft.auditLogRetentionMonths === prevSettings.current.auditLogRetentionMonths;
    if (same) {
      setDraft(settings);
    }
    prevSettings.current = settings;
    // We intentionally exclude `draft` and `setDraft` so this effect only
    // runs when the persisted settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);
}
