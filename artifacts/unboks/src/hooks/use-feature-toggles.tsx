import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "unboks_feature_toggles";

const DEFAULTS = {
  dryRun: false,
  emailNotifications: true,
  aiSuggestReply: true,
};

export function useFeatureToggles() {
  const [toggles, setTogglesState] = useState(() => {
    if (typeof localStorage === "undefined") return DEFAULTS;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  useEffect(() => {
    const sync = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setTogglesState({ ...DEFAULTS, ...JSON.parse(raw) });
      } catch {}
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const setToggle = useCallback((key: keyof typeof DEFAULTS, value: boolean) => {
    const next = { ...toggles, [key]: value };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
    setTogglesState(next);
    window.dispatchEvent(new CustomEvent("unboks_feature_toggles_changed"));
  }, [toggles]);

  return { ...toggles, setToggle };
}
