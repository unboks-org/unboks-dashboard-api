import { useMemo, useState } from "react";
import { Archive, Download, Trash2, ChevronDown } from "lucide-react";
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
  return options.find((o) => o.value === value)?.label ?? "Not set";
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

function MiniButton({
  children,
  onClick,
  variant = "default",
  icon: Icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
        variant === "danger"
          ? "border-[#f5c6c0] bg-white text-[#a50e0e] hover:bg-[#fce8e6]"
          : "border-[#dadce0] bg-white text-[#3c4043] hover:bg-[#f6f8fc]",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
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
      "Saved locally. Backend retention automation will be connected by the Unboks team.",
    );
  };

  const showPlaceholder = (label: string) => {
    toast(`${label}: data retention actions will be connected by the Unboks team.`);
  };

  // Honest status string: until the backend reports policyActive, we
  // display "Saved locally" so the operator never assumes automation is
  // running on their data.
  const policyLine = settings.status?.policyActive
    ? "Active"
    : "Saved locally (automation pending)";
  const nextCleanup = settings.status?.nextCleanupAt
    ? new Date(settings.status.nextCleanupAt).toLocaleString()
    : "Not scheduled yet";

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white">
      <header className="border-b border-[#f1f3f4] px-5 py-4 sm:px-6">
        <h3 className="text-[14px] font-semibold text-[#202124]">
          Data retention & archive
        </h3>
        <p className="mt-0.5 text-[13px] text-[#5f6368]">
          Control how long conversations stay active, archived, and searchable.
        </p>
      </header>

      <div>
        <Row
          label="Archive inactive conversations after"
          helper="Inactive conversations leave the daily inbox but remain searchable in the archive."
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
                  {o.label}
                </option>
              ))}
            </Select>
          }
        />
        <Row
          label="Keep archived conversations for"
          helper="Archived conversations stay available for history, disputes, and customer context."
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
                  {o.label}
                </option>
              ))}
            </Select>
          }
        />
        <Row
          label="After the archive period"
          helper="Anonymizing keeps useful statistics while removing personal customer details."
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
                  {o.label}
                </option>
              ))}
            </Select>
          }
        />
        <Row
          label="Keep approved AI learnings after archive or delete"
          helper="Approved answers and business knowledge can remain available to the AI without keeping the full private conversation forever."
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
              <span>{draft.keepApprovedLearnings ? "On" : "Off"}</span>
            </label>
          }
        />
        <Row
          label="Keep escalation and audit logs for"
          helper="Useful for quality control and accountability."
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
                  {o.label}
                </option>
              ))}
            </Select>
          }
        />

        <div className="border-t border-[#f1f3f4] px-4 py-3 sm:px-5">
          <p className="text-[12px] font-medium text-[#5f6368]">Manual actions</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <MiniButton
              icon={Archive}
              onClick={() => showPlaceholder("Archive old conversations")}
            >
              Archive old conversations now
            </MiniButton>
            <MiniButton
              icon={Download}
              onClick={() => showPlaceholder("Export conversation data")}
            >
              Export conversation data
            </MiniButton>
            <MiniButton
              icon={Trash2}
              variant="danger"
              onClick={() => showPlaceholder("Delete customer data")}
            >
              Delete customer data…
            </MiniButton>
          </div>
        </div>

        <div className="border-t border-[#f1f3f4] bg-[#fafbfc] px-4 py-3 text-[12px] text-[#5f6368] sm:px-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span>
              Retention policy:{" "}
              <span className="font-medium text-[#3c4043]">{policyLine}</span>
            </span>
            <span>
              Next cleanup:{" "}
              <span className="font-medium text-[#3c4043]">{nextCleanup}</span>
            </span>
          </div>
          <p className="mt-1.5">
            Currently saved on this device only. The Unboks team will connect
            backend automation, after which scheduled cleanups appear here.
          </p>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f1f3f4] bg-[#fafbfc] px-4 py-3 sm:px-5">
        <div className="text-[12px] text-[#5f6368]">
          <p className="font-medium text-[#3c4043]">Effective values</p>
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
            Saved
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
            Save changes
          </button>
        </div>
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";

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
