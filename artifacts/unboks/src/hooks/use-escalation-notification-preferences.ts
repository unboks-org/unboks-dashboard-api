import { useState, useEffect, useCallback } from "react";

export type NotifyChannelKey = "whatsapp" | "messenger" | "telegram";

export interface NotifyChannelPref {
  enabled: boolean;
  destination: string;
}

export type EscalationNotificationPrefs = Record<NotifyChannelKey, NotifyChannelPref>;

const STORAGE_KEY = "unboks_escalation_notify_prefs";
const EVENT_NAME = "unboks_escalation_notify_prefs_changed";

const DEFAULT: EscalationNotificationPrefs = {
  whatsapp: { enabled: false, destination: "" },
  messenger: { enabled: false, destination: "" },
  telegram: { enabled: false, destination: "" },
};

function readFromStorage(): EscalationNotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT;
    const merged: EscalationNotificationPrefs = { ...DEFAULT };
    for (const key of Object.keys(DEFAULT) as NotifyChannelKey[]) {
      const v = parsed[key];
      if (v && typeof v === "object") {
        merged[key] = {
          enabled: Boolean(v.enabled),
          destination: typeof v.destination === "string" ? v.destination : "",
        };
      }
    }
    return merged;
  } catch {
    return DEFAULT;
  }
}

export function useEscalationNotificationPrefs() {
  const [prefs, setPrefs] = useState<EscalationNotificationPrefs>(readFromStorage);

  useEffect(() => {
    const sync = () => setPrefs(readFromStorage());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const save = useCallback((next: EscalationNotificationPrefs) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch {
      // ignore
    }
    setPrefs(next);
  }, []);

  return { prefs, save };
}
