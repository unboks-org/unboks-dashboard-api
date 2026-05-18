import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "unboks_email_client";
const DEFAULT = "gmail";

export function useEmailSettings() {
  const [client, setClientState] = useState<string>(() => {
    if (typeof localStorage === "undefined") return DEFAULT;
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT;
    } catch {
      return DEFAULT;
    }
  });

  useEffect(() => {
    const sync = () => {
      try {
        const val = localStorage.getItem(STORAGE_KEY);
        if (val) setClientState(val);
      } catch {}
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const setClient = useCallback((newClient: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, newClient);
    } catch {}
    setClientState(newClient);
    window.dispatchEvent(new CustomEvent("unboks_email_client_changed"));
  }, []);

  return { client, setClient };
}
