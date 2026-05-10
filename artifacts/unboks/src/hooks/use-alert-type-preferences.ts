/**
 * use-alert-type-preferences — which kinds of alerts the operator wants
 * to receive.
 *
 * Two independent toggles:
 *   - escalations  → urgent moments where Marina needs human help
 *   - appointments → confirmed bookings / scheduled calls
 *
 * Storage
 * =======
 * The current backend alerts endpoint only models channels (email,
 * WhatsApp, Telegram, Messenger). It doesn't yet expose an "alert type"
 * preference, so this hook persists the flags to localStorage. When the
 * backend grows a `alertTypes` field on the settings payload (see the
 * Settings UI brief), the same shape can be moved server-side without
 * any consumer-side change.
 *
 * Defaults
 * ========
 * Both alert types default to ON. Turning Appointments off only stops
 * future delivery if the backend is also honouring the flag — until
 * then the toggle is a saved local preference. The UI surfaces this
 * honestly with a "saved on this device" hint.
 *
 * Escalation email is always on regardless of the toggle, because the
 * existing escalation-alerts service treats the default account email
 * as a mandatory destination. The toggle gates the non-email channels.
 */

import { useCallback, useEffect, useState } from "react";

export interface AlertTypePrefs {
  escalations: boolean;
  appointments: boolean;
}

const DEFAULTS: AlertTypePrefs = {
  escalations: true,
  appointments: true,
};

const STORAGE_KEY = "unboks_alert_type_prefs_v1";

function read(): AlertTypePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      escalations:
        typeof parsed.escalations === "boolean"
          ? parsed.escalations
          : DEFAULTS.escalations,
      appointments:
        typeof parsed.appointments === "boolean"
          ? parsed.appointments
          : DEFAULTS.appointments,
    };
  } catch {
    return DEFAULTS;
  }
}

function write(prefs: AlertTypePrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private-mode failures
  }
}

export function useAlertTypePrefs() {
  const [prefs, setPrefs] = useState<AlertTypePrefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPrefs(read());
    setLoaded(true);
  }, []);

  const update = useCallback(
    (patch: Partial<AlertTypePrefs>) => {
      setPrefs((current) => {
        const next = { ...current, ...patch };
        write(next);
        return next;
      });
    },
    [],
  );

  return { prefs, update, loaded };
}
