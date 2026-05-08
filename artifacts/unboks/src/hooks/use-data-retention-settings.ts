import { useCallback, useEffect, useState } from "react";

/**
 * Local-only Data Retention & Archive settings.
 *
 * Mirrors the localStorage fallback pattern used by `useAccountSettings`:
 * we persist the operator's intent on this device until the backend ships
 * the canonical endpoints. The shape and allowed values match the agreed
 * future API contract:
 *
 *   GET  /api/{client}/dashboard/api/settings/data-retention
 *   PUT  /api/{client}/dashboard/api/settings/data-retention
 *
 * The UI must NOT claim the automation is active when only the local copy
 * exists, so the `status.policyActive` flag stays `false` for now.
 */

const STORAGE_KEY = "unboks_data_retention_settings";
const EVENT_NAME = "unboks_data_retention_settings_changed";

export type ActiveInboxArchiveAfterDays = 30 | 60 | 90 | 180 | null;
export const ACTIVE_INBOX_OPTIONS: { value: ActiveInboxArchiveAfterDays; label: string }[] = [
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
  { value: null, label: "Never automatically archive" },
];

export type ArchiveRetentionMonths = 12 | 24 | 36 | 60 | null;
export const ARCHIVE_RETENTION_OPTIONS: { value: ArchiveRetentionMonths; label: string }[] = [
  { value: 12, label: "12 months" },
  { value: 24, label: "24 months" },
  { value: 36, label: "36 months" },
  { value: 60, label: "5 years" },
  { value: null, label: "Never delete automatically" },
];

export type EndOfRetentionAction = "anonymize" | "delete" | "keep";
export const END_OF_RETENTION_OPTIONS: { value: EndOfRetentionAction; label: string }[] = [
  { value: "anonymize", label: "Anonymize customer data" },
  { value: "delete", label: "Delete messages permanently" },
  { value: "keep", label: "Keep forever" },
];

export type AuditLogRetentionMonths = 12 | 24 | 36 | 60;
export const AUDIT_LOG_OPTIONS: { value: AuditLogRetentionMonths; label: string }[] = [
  { value: 12, label: "12 months" },
  { value: 24, label: "24 months" },
  { value: 36, label: "36 months" },
  { value: 60, label: "5 years" },
];

export interface DataRetentionStatus {
  policyActive: boolean;
  nextCleanupAt?: string;
}

export interface DataRetentionSettings {
  activeInboxArchiveAfterDays: ActiveInboxArchiveAfterDays;
  archiveRetentionMonths: ArchiveRetentionMonths;
  endOfRetentionAction: EndOfRetentionAction;
  keepApprovedLearnings: boolean;
  auditLogRetentionMonths: AuditLogRetentionMonths;
  status?: DataRetentionStatus;
}

export const DEFAULT_DATA_RETENTION: DataRetentionSettings = {
  activeInboxArchiveAfterDays: 90,
  archiveRetentionMonths: 24,
  endOfRetentionAction: "anonymize",
  keepApprovedLearnings: true,
  auditLogRetentionMonths: 24,
  status: { policyActive: false },
};

function isActiveInboxValue(v: unknown): v is ActiveInboxArchiveAfterDays {
  return v === null || v === 30 || v === 60 || v === 90 || v === 180;
}
function isArchiveValue(v: unknown): v is ArchiveRetentionMonths {
  return v === null || v === 12 || v === 24 || v === 36 || v === 60;
}
function isEndOfRetention(v: unknown): v is EndOfRetentionAction {
  return v === "anonymize" || v === "delete" || v === "keep";
}
function isAuditValue(v: unknown): v is AuditLogRetentionMonths {
  return v === 12 || v === 24 || v === 36 || v === 60;
}

/** Defensive parse, falls back to defaults for any field that fails
 *  validation so a partial/bad localStorage entry can never crash the UI. */
function sanitize(parsed: unknown): DataRetentionSettings {
  if (!parsed || typeof parsed !== "object") return { ...DEFAULT_DATA_RETENTION };
  const r = parsed as Partial<DataRetentionSettings>;
  return {
    activeInboxArchiveAfterDays: isActiveInboxValue(r.activeInboxArchiveAfterDays)
      ? r.activeInboxArchiveAfterDays
      : DEFAULT_DATA_RETENTION.activeInboxArchiveAfterDays,
    archiveRetentionMonths: isArchiveValue(r.archiveRetentionMonths)
      ? r.archiveRetentionMonths
      : DEFAULT_DATA_RETENTION.archiveRetentionMonths,
    endOfRetentionAction: isEndOfRetention(r.endOfRetentionAction)
      ? r.endOfRetentionAction
      : DEFAULT_DATA_RETENTION.endOfRetentionAction,
    keepApprovedLearnings:
      typeof r.keepApprovedLearnings === "boolean"
        ? r.keepApprovedLearnings
        : DEFAULT_DATA_RETENTION.keepApprovedLearnings,
    auditLogRetentionMonths: isAuditValue(r.auditLogRetentionMonths)
      ? r.auditLogRetentionMonths
      : DEFAULT_DATA_RETENTION.auditLogRetentionMonths,
    status: r.status && typeof r.status === "object"
      ? {
          policyActive: Boolean((r.status as DataRetentionStatus).policyActive),
          nextCleanupAt:
            typeof (r.status as DataRetentionStatus).nextCleanupAt === "string"
              ? (r.status as DataRetentionStatus).nextCleanupAt
              : undefined,
        }
      : { policyActive: false },
  };
}

function readFromStorage(): DataRetentionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DATA_RETENTION };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DATA_RETENTION };
  }
}

export function useDataRetentionSettings() {
  const [settings, setSettings] = useState<DataRetentionSettings>(readFromStorage);

  useEffect(() => {
    const sync = () => setSettings(readFromStorage());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const save = useCallback((next: DataRetentionSettings) => {
    const safe = sanitize(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch {
      // Quota / privacy mode, non-fatal.
    }
    setSettings(safe);
  }, []);

  return { settings, save };
}
