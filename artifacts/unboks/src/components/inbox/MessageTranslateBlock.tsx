/**
 * MessageTranslateBlock — per-message inline translation control.
 *
 * Operator-only utility: lets a human read a customer or assistant message
 * in a chosen target language. Translations are rendered inline below the
 * original; the original is never replaced or altered, no payload is sent
 * to the customer, and Marina's reply behavior is unaffected.
 *
 * UI is a small split control modelled on Gmail / Intercom / Front /
 * Slack inline message tools, validated against Refero references
 * (clean popover dropdown, 14px items, soft shadow, checkmark on
 * selected — Resend admin Select pattern).
 *
 *   [ 🌐 Translate ] [ English ▾ ]
 *
 * The left button performs the translation into the currently-selected
 * language. The right button opens a small popover with v1 languages.
 *
 * Caching:
 *   Translations are cached locally per (messageId + targetLanguage), so
 *   switching back to a language already translated does NOT re-call the
 *   API. Switching to a new language uses the new value when Translate is
 *   clicked. The cache lives for the component's lifetime.
 *
 * Backend: reuses the existing `/api/{client}/dashboard/api/ai-editor`
 * endpoint with `action: "translate"` (see `aiEditorEdit`). The user-facing
 * label here stays "Translate", never "AI Editor", because this is a
 * read-side utility for understanding a message, not a draft-editing tool.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages, Loader2, X } from "lucide-react";
import { useMessageTranslation } from "@/hooks/use-client-api";
import {
  TRANSLATION_LANGUAGES,
  useTranslationLanguage,
} from "@/hooks/use-translation-language";
import { ApiError } from "@/lib/error";
import type { AIEditorLanguage } from "@/lib/api";
import { cn } from "@/lib/utils";

const NOT_CONNECTED_STATUSES = new Set([0, 404, 501, 503]);

interface MessageTranslateBlockProps {
  messageId: string;
  text: string;
  conversationId: string;
  channel: string;
  /** Visual variant. "bubble" = compact link-style trigger that lives
   *  inside a chat bubble; "card" = inline text-button under an email
   *  card body. */
  variant?: "bubble" | "card";
}

type View =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "translated"; language: AIEditorLanguage }
  | { kind: "error"; tone: "info" | "error"; message: string };

export function MessageTranslateBlock({
  messageId,
  text,
  conversationId,
  channel,
  variant = "bubble",
}: MessageTranslateBlockProps) {
  const translate = useMessageTranslation();
  // Language is shared across every MessageTranslateBlock in the tab and
  // persisted in localStorage — see useTranslationLanguage.
  const [language, setLanguage] = useTranslationLanguage();
  const [view, setView] = useState<View>({ kind: "idle" });
  const [pickerOpen, setPickerOpen] = useState(false);
  // Cache key: targetLanguage. Survives Hide / re-translate cycles.
  const cacheRef = useRef<Map<AIEditorLanguage, string>>(new Map());
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Close the language popover on outside click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const trimmed = text?.trim() ?? "";
  if (trimmed.length === 0) return null;

  const onTranslate = () => {
    if (view.kind === "loading") return;

    // Cache hit for the currently-selected language: no API call.
    const cached = cacheRef.current.get(language);
    if (cached !== undefined) {
      setView({ kind: "translated", language });
      return;
    }

    setView({ kind: "loading" });
    translate.mutate(
      {
        text: trimmed,
        targetLanguage: language,
        context: {
          conversationId,
          messageId,
          channel: channel.toLowerCase(),
          usage: "operator_message_translation",
        },
      },
      {
        onSuccess: (result) => {
          cacheRef.current.set(language, result.text);
          setView({ kind: "translated", language });
        },
        onError: (err) => {
          // 401/403 are owned by the global session-expired handler. Reset
          // to idle so the trigger reappears once they're re-authenticated.
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            setView({ kind: "idle" });
            return;
          }
          if (isNotConnected(err)) {
            setView({
              kind: "error",
              tone: "info",
              message: "Translation will be connected by the Unboks team.",
            });
            return;
          }
          setView({
            kind: "error",
            tone: "error",
            message: "Could not translate this message. Try again.",
          });
        },
      },
    );
  };

  const onHide = () => {
    if (view.kind === "translated" || view.kind === "error") {
      setView({ kind: "idle" });
    }
  };

  const onPickLanguage = (next: AIEditorLanguage) => {
    setPickerOpen(false);
    if (next === language) return;
    setLanguage(next);
  };

  // Language can change from another MessageTranslateBlock in the same
  // tab (shared hook). When it does, never keep the previous translation
  // visible under a wrong "Translated to {newLang}" label — swap to the
  // newly-selected language's cached translation if we have one,
  // otherwise return to idle so the operator can click Translate.
  useEffect(() => {
    if (view.kind !== "translated") return;
    if (view.language === language) return;
    const cached = cacheRef.current.get(language);
    setView(cached !== undefined ? { kind: "translated", language } : { kind: "idle" });
  }, [language, view]);

  const triggerLabel = view.kind === "loading" ? "Translating…" : "Translate";
  const showTrigger = view.kind === "idle" || view.kind === "loading";

  // Always-visible, high-contrast control. Uses the dashboard's blue
  // accent so the action is unmistakable on desktop AND mobile, with no
  // hover or opacity tricks. Identical styling for both variants.
  const triggerClass = cn(
    "inline-flex items-center gap-1.5 border px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8] hover:bg-[#d2e3fc]",
    "rounded-l-full rounded-r-none border-r-0",
  );
  const langButtonClass = cn(
    "inline-flex items-center gap-1 border px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
    "border-[#1a73e8] bg-white text-[#1a73e8] hover:bg-[#e8f0fe]",
    "rounded-r-full rounded-l-none",
  );

  return (
    <>
      {showTrigger && (
        <div className={cn("inline-flex items-stretch", variant === "bubble" ? "mt-1.5" : "mt-3")}>
          <button
            type="button"
            onClick={onTranslate}
            disabled={view.kind === "loading"}
            title={`Translate message to ${language}`}
            aria-label={`Translate message to ${language}`}
            className={triggerClass}
          >
            {view.kind === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Languages className="h-3.5 w-3.5" />
            )}
            {triggerLabel}
          </button>
          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              aria-label={`Translation language: ${language}. Click to change.`}
              title="Choose translation language"
              className={langButtonClass}
            >
              {language}
              <ChevronDown className="h-3 w-3" />
            </button>
            {pickerOpen && (
              <div
                role="listbox"
                aria-label="Translation language"
                className={cn(
                  "absolute z-20 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-[#e2e8f0] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]",
                  // Anchor the popover to the right edge of the chevron
                  // button so it never clips off the right side of a
                  // narrow chat pane on mobile.
                  "right-0",
                )}
              >
                {TRANSLATION_LANGUAGES.map((lang) => {
                  const selected = lang === language;
                  return (
                    <button
                      key={lang}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => onPickLanguage(lang)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px]",
                        selected
                          ? "bg-[#f0f6ff] text-[#0b3b8c] font-semibold"
                          : "text-[#1f2937] hover:bg-[#f3f4f6]",
                      )}
                    >
                      <span>{lang}</span>
                      {selected && <Check className="h-3.5 w-3.5 text-[#1a73e8]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {view.kind === "translated" && (
        <div
          className="mt-2 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2"
          role="region"
          aria-label={`Message translated to ${view.language}`}
        >
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#64748b]">
              <Languages className="h-3 w-3" />
              Translated to {view.language}
            </span>
            <button
              type="button"
              onClick={onHide}
              className="inline-flex items-center gap-1 text-[11px] text-[#64748b] hover:text-[#1f2937]"
              title="Hide translation"
              aria-label="Hide translation"
            >
              <X className="h-3 w-3" />
              Hide
            </button>
          </div>
          <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.5] text-[#1f2937]">
            {cacheRef.current.get(view.language) ?? ""}
          </p>
        </div>
      )}

      {view.kind === "error" && (
        <div
          role="status"
          className={cn(
            "mt-2 rounded-lg border px-3 py-2 text-[12px]",
            view.tone === "info"
              ? "border-[#cfe2ff] bg-[#f0f6ff] text-[#0b3b8c]"
              : "border-[#f6c6c2] bg-[#fce8e6] text-[#5f1414]",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{view.message}</span>
            <button
              type="button"
              onClick={onHide}
              className="text-[11px] underline opacity-70 hover:opacity-100"
              aria-label="Dismiss translation notice"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function isNotConnected(err: unknown): boolean {
  if (err instanceof ApiError) return NOT_CONNECTED_STATUSES.has(err.status);
  return !(err instanceof Error) || err.name === "TypeError" || err.message === "Failed to fetch";
}
