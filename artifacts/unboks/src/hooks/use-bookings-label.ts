import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "unboks_bookings_label";
const DEFAULT_LABEL = "Bookings";

export function useBookingsLabel() {
  const [label, setLabelState] = useState<string>(() => {
    if (typeof localStorage === "undefined") return DEFAULT_LABEL;
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_LABEL;
    } catch {
      return DEFAULT_LABEL;
    }
  });

  useEffect(() => {
    const sync = () => {
      try {
        const val = localStorage.getItem(STORAGE_KEY);
        if (val) setLabelState(val);
      } catch {}
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const setLabel = useCallback((newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {}
    setLabelState(trimmed);
    window.dispatchEvent(new CustomEvent("unboks_bookings_label_changed"));
  }, []);

  return { label, setLabel };
}
