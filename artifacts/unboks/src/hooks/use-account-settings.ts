import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "unboks_account_settings";
const EVENT_NAME = "unboks_account_settings_changed";

export interface AccountSettings {
  businessName: string;
  contactEmail: string;
  phone: string;
  website: string;
  logoDataUrl?: string;
}

const DEFAULT: AccountSettings = {
  businessName: "",
  contactEmail: "",
  phone: "",
  website: "",
};

function readFromStorage(): AccountSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return { ...DEFAULT, ...parsed };
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT;
}

/**
 * Local-only account settings. Stored in localStorage as a v1 dashboard
 * preference. Replace with API calls when the backend ships
 * `/api/unboks/account-settings`.
 */
export function useAccountSettings() {
  const [settings, setSettings] = useState<AccountSettings>(readFromStorage);

  useEffect(() => {
    const sync = () => setSettings(readFromStorage());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const save = useCallback((next: AccountSettings) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch {
      // ignore
    }
    setSettings(next);
  }, []);

  return { settings, save };
}
