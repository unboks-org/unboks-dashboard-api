/**
 * useTranslationLanguage — shared, persistent translation target language.
 *
 * Every MessageTranslateBlock reads/writes this single value so that
 * picking "Dutch" on any one message updates every other Translate
 * control in the conversation (and across the dashboard) immediately.
 *
 * Persistence: localStorage key `unboks_translation_target_language`
 * survives refresh / navigation / re-mount.
 *
 * Sync between component instances in the SAME tab is done via a custom
 * window event — `storage` events only fire across tabs, not within the
 * tab that wrote the value, so we dispatch our own `unboks:translation-lang`
 * event on every set.
 */

import { useEffect, useState, useCallback } from "react";
import type { AIEditorLanguage } from "@/lib/api";

export const TRANSLATION_LANGUAGES: AIEditorLanguage[] = [
  "English",
  "Dutch",
  "Spanish",
  "Papiamento",
  "Portuguese",
  "Swedish",
];

const STORAGE_KEY = "unboks_translation_target_language";
const EVENT_NAME = "unboks:translation-lang";
const DEFAULT_LANGUAGE: AIEditorLanguage = "English";

function isLanguage(v: unknown): v is AIEditorLanguage {
  return typeof v === "string" && (TRANSLATION_LANGUAGES as string[]).includes(v);
}

function readStored(): AIEditorLanguage {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(raw) ? raw : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function useTranslationLanguage(): [
  AIEditorLanguage,
  (next: AIEditorLanguage) => void,
] {
  const [language, setLanguageState] = useState<AIEditorLanguage>(readStored);

  useEffect(() => {
    const onLocal = (e: Event) => {
      const detail = (e as CustomEvent<AIEditorLanguage>).detail;
      if (isLanguage(detail)) setLanguageState(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (isLanguage(e.newValue)) setLanguageState(e.newValue);
    };
    window.addEventListener(EVENT_NAME, onLocal as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onLocal as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setLanguage = useCallback((next: AIEditorLanguage) => {
    if (!isLanguage(next)) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode, quota); the in-tab
      // event below still keeps every mounted control in sync.
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  }, []);

  return [language, setLanguage];
}
