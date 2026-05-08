import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "unboks_your_info_updates";
const EVENT_NAME = "unboks_your_info_updates_changed";

export type YourInfoUpdateType =
  | "general"
  | "offer"
  | "holiday"
  | "hours"
  | "pricing"
  | "policy"
  | "other";

export interface YourInfoUpdate {
  id: string;
  type: YourInfoUpdateType;
  text: string;
  active: boolean;
  createdAt: string;
  startDate?: string;
  endDate?: string;
}

export const UPDATE_TYPES: { value: YourInfoUpdateType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "offer", label: "Offer" },
  { value: "holiday", label: "Holiday" },
  { value: "hours", label: "Hours" },
  { value: "pricing", label: "Pricing" },
  { value: "policy", label: "Policy" },
  { value: "other", label: "Other" },
];

function readFromStorage(): YourInfoUpdate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((u) => u && typeof u.id === "string");
    }
  } catch {
    // ignore
  }
  return [];
}

function persist(list: YourInfoUpdate[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // ignore
  }
}

/**
 * Local-only "Your Info Updates" — temporary notes/offers/holidays the AI
 * should know about. Stored in localStorage for v1. Replace with API calls
 * when the backend ships `/api/unboks/your-info-updates`.
 */
export function useYourInfoUpdates() {
  const [updates, setUpdates] = useState<YourInfoUpdate[]>(readFromStorage);

  useEffect(() => {
    const sync = () => setUpdates(readFromStorage());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const addUpdate = useCallback(
    (input: Omit<YourInfoUpdate, "id" | "createdAt" | "active"> & { active?: boolean }) => {
      const next: YourInfoUpdate = {
        id: (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        type: input.type,
        text: input.text,
        active: input.active ?? true,
        createdAt: new Date().toISOString(),
        startDate: input.startDate,
        endDate: input.endDate,
      };
      setUpdates((current) => {
        const list = [next, ...current];
        persist(list);
        return list;
      });
    },
    [],
  );

  const setActive = useCallback((id: string, active: boolean) => {
    setUpdates((current) => {
      const list = current.map((u) => (u.id === id ? { ...u, active } : u));
      persist(list);
      return list;
    });
  }, []);

  const removeUpdate = useCallback((id: string) => {
    setUpdates((current) => {
      const list = current.filter((u) => u.id !== id);
      persist(list);
      return list;
    });
  }, []);

  return { updates, addUpdate, setActive, removeUpdate };
}
