import { useState, useEffect, useCallback } from "react";
import {
  fetchAccountSettings,
  saveAccountSettings,
  type AccountSettingsApiResponse,
} from "@/lib/api";
import { getClientSlug } from "@/lib/tenant";

const STORAGE_KEY_PREFIX = "unboks_account_settings";
const LEGACY_STORAGE_KEY = "unboks_account_settings";
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

function storageKey(slug = getClientSlug()): string {
  return `${STORAGE_KEY_PREFIX}:${slug}`;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fromApi(data: AccountSettingsApiResponse): AccountSettings {
  return {
    businessName: clean(data.name),
    contactEmail: clean(data.email) || clean(data.support_email),
    phone: clean(data.phone) || clean(data.whatsapp),
    website: clean(data.website),
  };
}

function readFromStorage(slug = getClientSlug()): AccountSettings | null {
  try {
    let raw = localStorage.getItem(storageKey(slug));
    // Preserve the old local-only Unboks workspace settings without
    // letting them leak into every new tenant in the same browser.
    if (!raw && slug === "unboks") raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return { ...DEFAULT, ...parsed };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function writeToStorage(next: AccountSettings, slug = getClientSlug()) {
  localStorage.setItem(storageKey(slug), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

/**
 * Tenant-scoped workspace settings.
 *
 * The backend seeds identity from client.json so fresh Nr 3 tenants
 * start with their own name/email/phone instead of any browser-local
 * Unboks defaults. Logo remains local-only until the backend has a
 * safe upload endpoint, but it is scoped by tenant slug.
 */
export function useAccountSettings() {
  const [settings, setSettings] = useState<AccountSettings>(
    () => readFromStorage() ?? DEFAULT,
  );

  useEffect(() => {
    const slug = getClientSlug();
    const local = readFromStorage(slug);
    setSettings(local ?? DEFAULT);
    let cancelled = false;

    fetchAccountSettings()
      .then((apiSettings) => {
        if (cancelled) return;
        const latestLocal = readFromStorage(slug);
        const next = {
          ...fromApi(apiSettings),
          ...(latestLocal ?? {}),
        };
        setSettings(next);
        writeToStorage(next, slug);
      })
      .catch(() => {
        // Keep the tenant-scoped local fallback; callers that save will
        // surface API failures then.
      });

    const sync = () => setSettings(readFromStorage(slug) ?? DEFAULT);
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const save = useCallback(async (next: AccountSettings) => {
    const saved = fromApi(
      await saveAccountSettings({
        name: next.businessName,
        email: next.contactEmail,
        phone: next.phone,
        website: next.website,
      }),
    );
    const merged = { ...saved, logoDataUrl: next.logoDataUrl };
    try {
      writeToStorage(merged);
    } catch {
      // ignore local fallback write failure; backend already saved.
    }
    setSettings(merged);
  }, []);

  return { settings, save };
}
