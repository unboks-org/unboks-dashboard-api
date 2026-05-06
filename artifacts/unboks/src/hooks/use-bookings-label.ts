import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "unboks_bookings_label";
const EVENT_NAME = "unboks_bookings_label_changed";
const DEFAULT_LABEL = "Bookings";

function readFromStorage(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (typeof raw === "string" && raw.trim().length > 0) return raw;
  } catch {
    // ignore
  }
  return DEFAULT_LABEL;
}

export function useBookingsLabel() {
  const [label, setLabelState] = useState<string>(readFromStorage);

  useEffect(() => {
    const sync = () => setLabelState(readFromStorage());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const setLabel = useCallback((value: string) => {
    const trimmed = value.trim();
    const next = trimmed.length > 0 ? trimmed : DEFAULT_LABEL;
    try {
      localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch {
      // ignore
    }
    setLabelState(next);
    return next;
  }, []);

  return { label, setLabel };
}
