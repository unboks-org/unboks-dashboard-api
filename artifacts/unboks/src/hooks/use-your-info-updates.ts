import { useState, useEffect, useCallback } from "react";
import {
  createInfoUpdate,
  deleteInfoUpdate,
  fetchInfoUpdates,
  setInfoUpdateActive,
  type InfoUpdateApiItem,
} from "@/lib/api";
import { getClientSlug } from "@/lib/tenant";

const STORAGE_KEY_PREFIX = "unboks_your_info_updates";
const LEGACY_STORAGE_KEY = "unboks_your_info_updates";
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

const UPDATE_TYPE_VALUES = new Set<string>(UPDATE_TYPES.map((t) => t.value));

function storageKey(slug = getClientSlug()): string {
  return `${STORAGE_KEY_PREFIX}:${slug}`;
}

function asUpdateType(value: unknown): YourInfoUpdateType {
  return typeof value === "string" && UPDATE_TYPE_VALUES.has(value)
    ? (value as YourInfoUpdateType)
    : "other";
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeApiUpdate(item: InfoUpdateApiItem): YourInfoUpdate | null {
  const id = String(item.id ?? "");
  const text = cleanText(item.text);
  if (!id || !text) return null;
  return {
    id,
    type: asUpdateType(item.type),
    text,
    active: item.active !== false,
    createdAt: cleanText(item.createdAt) || new Date().toISOString(),
    startDate: cleanText(item.startDate) || undefined,
    endDate: cleanText(item.endDate) || undefined,
  };
}

function readFromStorage(slug = getClientSlug()): YourInfoUpdate[] {
  try {
    let raw = localStorage.getItem(storageKey(slug));
    // Preserve old Unboks notes only for the Unboks tenant. Never let
    // pricing or other Unboks-specific notes leak into new tenants.
    if (!raw && slug === "unboks") raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((u) => u && typeof u.id === "string");
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function persist(list: YourInfoUpdate[], slug = getClientSlug()) {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // ignore
  }
}

/**
 * Tenant-scoped "Your Info Updates".
 *
 * Backend is canonical when available. localStorage is only a
 * tenant-scoped fallback/cache, so an Unboks pricing note cannot appear
 * inside LAWYER or any future tenant workspace.
 */
export function useYourInfoUpdates() {
  const [updates, setUpdates] = useState<YourInfoUpdate[]>(
    () => readFromStorage(),
  );

  const refresh = useCallback(async () => {
    const slug = getClientSlug();
    const response = await fetchInfoUpdates();
    const next = (response.updates ?? [])
      .map(normalizeApiUpdate)
      .filter((u): u is YourInfoUpdate => Boolean(u));
    setUpdates(next);
    persist(next, slug);
    return next;
  }, []);

  useEffect(() => {
    const slug = getClientSlug();
    setUpdates(readFromStorage(slug));
    let cancelled = false;

    refresh().catch(() => {
      if (!cancelled) setUpdates(readFromStorage(slug));
    });

    const sync = () => setUpdates(readFromStorage(slug));
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, [refresh]);

  const addUpdate = useCallback(
    async (input: Omit<YourInfoUpdate, "id" | "createdAt" | "active"> & { active?: boolean }) => {
      await createInfoUpdate({
        type: input.type,
        text: input.text,
        active: input.active ?? true,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
      });
      await refresh();
    },
    [refresh],
  );

  const setActive = useCallback(
    async (id: string, active: boolean) => {
      await setInfoUpdateActive(id, active);
      await refresh();
    },
    [refresh],
  );

  const removeUpdate = useCallback(
    async (id: string) => {
      await deleteInfoUpdate(id);
      await refresh();
    },
    [refresh],
  );

  return { updates, addUpdate, setActive, removeUpdate };
}
