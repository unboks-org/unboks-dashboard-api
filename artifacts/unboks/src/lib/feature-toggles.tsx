import { createContext, useContext, useState, ReactNode } from "react";

interface FeatureToggles {
  dryRun: boolean;
  emailNotifications: boolean;
  aiSuggestReply: boolean;
}

const STORAGE_KEY = "unboks_feature_toggles";

function load(): FeatureToggles {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { dryRun: false, emailNotifications: true, aiSuggestReply: true };
}

interface FeatureTogglesCtx {
  toggles: FeatureToggles;
  setToggle: (key: keyof FeatureToggles, value: boolean) => void;
}

const Ctx = createContext<FeatureTogglesCtx | null>(null);

export function FeatureTogglesProvider({ children }: { children: ReactNode }) {
  const [toggles, setToggles] = useState<FeatureToggles>(load);

  const setToggle = (key: keyof FeatureToggles, value: boolean) => {
    setToggles((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return <Ctx.Provider value={{ toggles, setToggle }}>{children}</Ctx.Provider>;
}

export function useFeatureToggles(): FeatureTogglesCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFeatureToggles must be used within FeatureTogglesProvider");
  return ctx;
}
