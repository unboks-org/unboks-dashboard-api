import { useState, useEffect, useCallback, useRef } from "react";
import {
  getEscalationAlertSettings,
  updateEscalationAlertSettings,
  type EscalationAlertSettings,
  type EscalationAlertChannelKey,
} from "@/lib/api";
import { ApiError } from "@/lib/error";

export type NotifyChannelKey = "whatsapp" | "messenger" | "telegram";

export interface NotifyChannelPref {
  enabled: boolean;
  destination: string;
}

export type EscalationNotificationPrefs = Record<NotifyChannelKey, NotifyChannelPref>;

/**
 * Per-channel delivery status surfaced to the UI as a small badge.
 *  - "active"                 → backend confirms outbound delivery is live
 *  - "saved_only"             → setting saved but nothing is dispatched yet
 *  - "provider_not_configured"→ provider connection still missing
 *  - "failed"                 → last attempted dispatch failed
 *  - "default"                → e.g. email always-on default account
 */
export type DeliveryStatus =
  | "active"
  | "saved_only"
  | "provider_not_configured"
  | "failed"
  | "default";

export type DeliveryStatusMap = Partial<
  Record<EscalationAlertChannelKey, DeliveryStatus>
>;

/**
 * Where the currently displayed prefs came from.
 *  - "backend" → loaded from (or saved to) the API at least once
 *  - "local"   → backend GET failed and we fell back to localStorage cache
 *  - "default" → no backend, no cache, showing baseline defaults
 */
export type PrefsSource = "backend" | "local" | "default";

const STORAGE_KEY = "unboks_escalation_notify_prefs";

const DEFAULT_PREFS: EscalationNotificationPrefs = {
  whatsapp: { enabled: false, destination: "" },
  messenger: { enabled: false, destination: "" },
  telegram: { enabled: false, destination: "" },
};

// -------- localStorage cache --------

function readFromStorage(): EscalationNotificationPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const merged: EscalationNotificationPrefs = { ...DEFAULT_PREFS };
    for (const key of Object.keys(DEFAULT_PREFS) as NotifyChannelKey[]) {
      const v = (parsed as Record<string, unknown>)[key];
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        merged[key] = {
          enabled: Boolean(o.enabled),
          destination: typeof o.destination === "string" ? o.destination : "",
        };
      }
    }
    return merged;
  } catch {
    return null;
  }
}

function writeToStorage(prefs: EscalationNotificationPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private-mode failures — cache is non-essential
  }
}

// -------- backend ⇄ UI conversion --------

function fromBackend(s: EscalationAlertSettings): EscalationNotificationPrefs {
  const next: EscalationNotificationPrefs = { ...DEFAULT_PREFS };
  for (const key of Object.keys(DEFAULT_PREFS) as NotifyChannelKey[]) {
    const ch = s.channels[key];
    if (ch) {
      next[key] = { enabled: Boolean(ch.enabled), destination: ch.destination ?? "" };
    }
  }
  return next;
}

function toBackend(prefs: EscalationNotificationPrefs): EscalationAlertSettings {
  // Email is always-on with the default account address; the backend
  // owns the actual destination so we send `enabled: true` and an
  // empty destination string (treated as "use default").
  return {
    channels: {
      email: { enabled: true, destination: "" },
      whatsapp: { enabled: prefs.whatsapp.enabled, destination: prefs.whatsapp.destination.trim() },
      messenger: { enabled: prefs.messenger.enabled, destination: prefs.messenger.destination.trim() },
      telegram: { enabled: prefs.telegram.enabled, destination: prefs.telegram.destination.trim() },
    },
  };
}

/**
 * Map a backend delivery status string onto our typed enum. Unknown values
 * collapse to null so the UI just hides the badge instead of showing
 * something raw and confusing.
 */
function normalizeStatus(raw: string | null | undefined): DeliveryStatus | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "active" || v === "ok" || v === "delivering") return "active";
  if (v === "saved_only" || v === "saved" || v === "skipped") return "saved_only";
  if (
    v === "provider_not_configured" ||
    v === "provider_not_connected" ||
    v === "not_configured" ||
    v === "no_provider"
  ) {
    return "provider_not_configured";
  }
  if (v === "failed" || v === "error") return "failed";
  if (v === "default") return "default";
  return null;
}

/**
 * Default delivery statuses when the backend doesn't supply explicit ones,
 * per the bugfix brief:
 *   - Email     → "default"
 *   - WhatsApp  → "active" if enabled, else null
 *   - Telegram  → "saved_only" / "provider_not_configured" if enabled
 *   - Messenger → "saved_only" / "provider_not_configured" if enabled
 */
function defaultStatuses(prefs: EscalationNotificationPrefs): DeliveryStatusMap {
  return {
    email: "default",
    whatsapp: prefs.whatsapp.enabled ? "active" : undefined,
    messenger: prefs.messenger.enabled ? "provider_not_configured" : undefined,
    telegram: prefs.telegram.enabled ? "provider_not_configured" : undefined,
  };
}

function computeStatuses(
  s: EscalationAlertSettings,
  prefs: EscalationNotificationPrefs,
): DeliveryStatusMap {
  const fallback = defaultStatuses(prefs);
  const out: DeliveryStatusMap = { ...fallback };
  for (const key of ["email", "whatsapp", "messenger", "telegram"] as EscalationAlertChannelKey[]) {
    const fromBackendStatus = normalizeStatus(s.channels[key]?.deliveryStatus);
    if (fromBackendStatus) out[key] = fromBackendStatus;
  }
  return out;
}

// -------- hook --------

export interface UseEscalationNotificationPrefsResult {
  prefs: EscalationNotificationPrefs;
  /**
   * Async save. Resolves after the backend PUT succeeds and the cache is
   * refreshed; rejects with the original error (typically `ApiError`) so
   * callers can show the backend message verbatim. Never silently fails.
   */
  save: (next: EscalationNotificationPrefs) => Promise<void>;
  isLoading: boolean;
  isSaving: boolean;
  source: PrefsSource;
  /**
   * Calm copy describing why the backend GET failed, e.g. when the
   * endpoint isn't deployed yet. `null` when the load succeeded.
   */
  loadError: string | null;
  deliveryStatuses: DeliveryStatusMap;
  /**
   * Resolved default email address (e.g. `hello@unboks.org`) when the
   * backend supplied one. Null otherwise — UI falls back to the legacy
   * "uses your default account email" line.
   */
  defaultEmailAddress: string | null;
}

interface State {
  prefs: EscalationNotificationPrefs;
  deliveryStatuses: DeliveryStatusMap;
  /**
   * Backend-resolved real email address used for escalation alerts
   * (e.g. `support_email` from the client config). Null when the
   * backend hasn't supplied one — UI then shows the legacy default copy.
   */
  defaultEmailAddress: string | null;
  isLoading: boolean;
  source: PrefsSource;
  loadError: string | null;
}

/**
 * Pull the operator-visible email address out of an escalation alert
 * settings payload. Prefers the backend's explicit `resolvedDestination`,
 * then a non-sentinel `destination` (rejecting the literal string
 * `"default"` which is just a routing hint, not an address). Returns
 * null when no real address could be found.
 */
function pickEmailAddress(s: import("@/lib/api").EscalationAlertSettings): string | null {
  const email = s.channels.email;
  if (!email) return null;
  const resolved = email.resolvedDestination?.trim();
  if (resolved && resolved.toLowerCase() !== "default") return resolved;
  const dest = email.destination?.trim();
  if (dest && dest.toLowerCase() !== "default") return dest;
  return null;
}

function describeLoadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404 || err.status === 501) {
      return "Escalation alerts service isn't connected yet. Showing your last saved settings from this device.";
    }
    if (err.status === 0) {
      return "Couldn't reach the server. Showing your last saved settings from this device.";
    }
    return err.message || `Couldn't load settings (${err.status}). Showing your last saved settings from this device.`;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Couldn't load settings. Showing your last saved settings from this device.";
}

export function useEscalationNotificationPrefs(): UseEscalationNotificationPrefsResult {
  const [state, setState] = useState<State>(() => {
    const local = readFromStorage();
    const prefs = local ?? DEFAULT_PREFS;
    return {
      prefs,
      deliveryStatuses: defaultStatuses(prefs),
      defaultEmailAddress: null,
      isLoading: true,
      source: local ? "local" : "default",
      loadError: null,
    };
  });
  const [isSaving, setIsSaving] = useState(false);
  const cancelledRef = useRef(false);

  // Initial backend load. Falls back to localStorage cache on failure.
  useEffect(() => {
    cancelledRef.current = false;
    (async () => {
      try {
        const remote = await getEscalationAlertSettings();
        if (cancelledRef.current) return;
        const prefs = fromBackend(remote);
        const statuses = computeStatuses(remote, prefs);
        writeToStorage(prefs);
        setState({
          prefs,
          deliveryStatuses: statuses,
          defaultEmailAddress: pickEmailAddress(remote),
          isLoading: false,
          source: "backend",
          loadError: null,
        });
      } catch (err) {
        if (cancelledRef.current) return;
        setState((s) => ({
          ...s,
          isLoading: false,
          loadError: describeLoadError(err),
        }));
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const save = useCallback(async (next: EscalationNotificationPrefs) => {
    setIsSaving(true);
    try {
      const remote = await updateEscalationAlertSettings(toBackend(next));
      // Merge per-channel: when the backend echoed the channel back, trust
      // it; when the channel is missing from the response (partial PUT
      // reply), keep what the user just submitted so we never silently
      // flip `enabled` back to false or wipe the destination they typed.
      const mergeChannel = (
        key: NotifyChannelKey,
      ): NotifyChannelPref => {
        const echoed = remote.channels[key];
        if (!echoed) return next[key];
        return {
          enabled: typeof echoed.enabled === "boolean" ? echoed.enabled : next[key].enabled,
          destination:
            typeof echoed.destination === "string" && echoed.destination.length > 0
              ? echoed.destination
              : next[key].destination,
        };
      };
      const merged: EscalationNotificationPrefs = {
        whatsapp: mergeChannel("whatsapp"),
        messenger: mergeChannel("messenger"),
        telegram: mergeChannel("telegram"),
      };
      const statuses = computeStatuses(remote, merged);
      writeToStorage(merged);
      setState((s) => ({
        prefs: merged,
        deliveryStatuses: statuses,
        // Email address comes from backend resolution; if the PUT response
        // re-includes it, refresh, otherwise keep what we already loaded.
        defaultEmailAddress: pickEmailAddress(remote) ?? s.defaultEmailAddress,
        isLoading: false,
        source: "backend",
        loadError: null,
      }));
    } finally {
      setIsSaving(false);
    }
  }, []);

  return {
    prefs: state.prefs,
    save,
    isLoading: state.isLoading,
    isSaving,
    source: state.source,
    loadError: state.loadError,
    deliveryStatuses: state.deliveryStatuses,
    defaultEmailAddress: state.defaultEmailAddress,
  };
}
