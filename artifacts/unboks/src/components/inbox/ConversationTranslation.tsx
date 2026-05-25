/**
 * ConversationTranslation — single source of truth for read-side message
 * translation across the open conversation.
 *
 * Replaces the old per-message Translate buttons (one per bubble + one per
 * email card). Operators usually need to understand the whole thread, not
 * one isolated message, so v2 ships a single compact toolbar at the top of
 * the conversation:
 *
 *   Translate conversation   [ Dutch ▾ ]   [ Translate ]   [ ☑ Show translations ]
 *
 * Visual reference: small toolbar/card pattern (Refero — Pitch dashboard
 * toolbars). Premium-SaaS-inbox patterns it draws from: Gmail's
 * "Translate message" row, Front's per-thread tools, Intercom's
 * conversation-level utility bar.
 *
 * Architecture
 * ============
 *  - `ConversationTranslationProvider` wraps the message thread + the
 *    toolbar and owns:
 *       - the shared target language (via the existing
 *         `useTranslationLanguage` hook, persisted in localStorage so the
 *         operator's pick survives refresh and applies across conversations)
 *       - a per-(messageId × language) translation cache
 *       - a single `visible` flag for showing / hiding all translations at
 *         once
 *       - load status + failure count
 *  - `ConversationTranslationBar` renders the toolbar.
 *  - `MessageTranslationView` is the small inline block rendered under each
 *    original message; it reads from context and shows the translation for
 *    the currently-selected language IF cached AND visible.
 *
 * Important rules preserved from v1
 * --------------------------------
 *  - Original messages are never replaced or modified.
 *  - Nothing is sent to the customer.
 *  - Cache is keyed by (messageId × targetLanguage); changing the language
 *    NEVER mislabels an old translation as the new language.
 *  - 401/403 are owned globally by AuthProvider — surfaced as the standard
 *    session-expired toast, not a per-message error here.
 *  - Status 0 / 404 / 501 / 503 surface the calm copy
 *    "Translation will be connected by the Unboks team."
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown, Languages, Loader2 } from "lucide-react";
import {
  TRANSLATION_LANGUAGES,
  useTranslationLanguage,
} from "@/hooks/use-translation-language";
import { translateMessage, type AIEditorLanguage, type ApiMessage } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const NOT_CONNECTED_STATUSES = new Set([0, 404, 501, 503]);

type Status = "idle" | "loading" | "done" | "not-connected";

interface TranslationCtx {
  language: AIEditorLanguage;
  setLanguage: (next: AIEditorLanguage) => void;
  visible: boolean;
  setVisible: (next: boolean) => void;
  status: Status;
  failureCount: number;
  hasAnyCached: boolean;
  /** Translate every non-empty message that isn't already cached for the
   *  currently-selected language. Safe to call repeatedly. */
  translateAll: () => Promise<void>;
  /** Get the cached translation for one message in the current language,
   *  or null if there isn't one. */
  getTranslation: (messageId: string) => { language: AIEditorLanguage; text: string } | null;
}

const Ctx = createContext<TranslationCtx | null>(null);

interface ProviderProps {
  conversationId: string;
  channel: string;
  messages: ApiMessage[];
  children: ReactNode;
}

export function ConversationTranslationProvider({
  conversationId,
  channel,
  messages,
  children,
}: ProviderProps) {
  const [language, setLanguageRaw] = useTranslationLanguage();
  // cache: messageId -> language -> translated text. Map preserves
  // identity so referenced reads stay fast across re-renders.
  const [cache, setCache] = useState<Map<string, Map<AIEditorLanguage, string>>>(
    () => new Map(),
  );
  const [status, setStatus] = useState<Status>("idle");
  const [failureCount, setFailureCount] = useState(0);
  const [visible, setVisible] = useState(true);
  // Guards against double-runs if the operator clicks Translate twice in
  // quick succession; React state updates are async so `status === "loading"`
  // alone isn't enough on the first click.
  const inflightRef = useRef(false);

  // When the operator switches conversations, the parent re-mounts this
  // provider with new messages — but if it doesn't (e.g. real-time message
  // append), we still want a fresh per-conversation status so a stale
  // "Some messages could not be translated." note doesn't bleed across.
  useEffect(() => {
    inflightRef.current = false;
    setStatus("idle");
    setFailureCount(0);
  }, [conversationId]);

  const hasAnyCached = useMemo(() => {
    for (const inner of cache.values()) {
      if (inner.size > 0) return true;
    }
    return false;
  }, [cache]);

  const setLanguage = useCallback(
    (next: AIEditorLanguage) => {
      if (next === language) return;
      setLanguageRaw(next);
      // Drop the "done / failures / not-connected" status from the previous
      // language so the operator sees a clean idle bar — they need to click
      // Translate again to fetch the new language. Cached translations for
      // OTHER languages stay in cache (correctness rule: never mislabel).
      setStatus("idle");
      setFailureCount(0);
    },
    [language, setLanguageRaw],
  );

  const getTranslation = useCallback(
    (messageId: string) => {
      if (!visible) return null;
      const inner = cache.get(messageId);
      const text = inner?.get(language);
      if (text === undefined) return null;
      return { language, text };
    },
    [cache, language, visible],
  );

  const translateAll = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setVisible(true);

    // Skip empty messages. Skip ones already cached for the current
    // language — re-clicking Translate after a successful run shouldn't
    // re-hit the API.
    const pending = messages.filter((m) => {
      const t = (m.content ?? "").trim();
      if (t.length === 0) return false;
      if (!m.id) return false;
      return cache.get(m.id)?.get(language) === undefined;
    });

    if (pending.length === 0) {
      // Everything's already translated for this language — just show what
      // we have. No "done" status because there was nothing to do.
      inflightRef.current = false;
      setStatus("done");
      setFailureCount(0);
      return;
    }

    setStatus("loading");
    setFailureCount(0);

    let failures = 0;
    let notConnectedHits = 0;

    // Promise.allSettled lets us keep partial results if some messages
    // fail, per spec: "If some messages fail, keep successful translations
    // and show calm note: Some messages could not be translated."
    const results = await Promise.allSettled(
      pending.map((m) =>
        translateMessage({
          text: (m.content ?? "").trim(),
          targetLanguage: language,
          context: {
            conversationId,
            messageId: m.id,
            channel: channel.toLowerCase(),
            usage: "operator_message_translation",
          },
        }).then((res) => ({ id: m.id, text: res.text })),
      ),
    );

    setCache((prev) => {
      const next = new Map(prev);
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const { id, text } = r.value;
        const inner = new Map(next.get(id) ?? []);
        inner.set(language, text);
        next.set(id, inner);
      }
      return next;
    });

    for (const r of results) {
      if (r.status === "rejected") {
        failures += 1;
        const err = r.reason;
        if (err instanceof ApiError && NOT_CONNECTED_STATUSES.has(err.status)) {
          notConnectedHits += 1;
        } else if (
          !(err instanceof Error) ||
          err.name === "TypeError" ||
          err.message === "Failed to fetch"
        ) {
          notConnectedHits += 1;
        }
        // 401/403 are surfaced globally by AuthProvider — nothing to do
        // here; we still count it as a failure so the operator sees the
        // "Some messages could not be translated." note rather than a
        // misleading "done".
      }
    }

    inflightRef.current = false;
    setFailureCount(failures);
    // If EVERY pending message failed AND every failure looked like
    // "backend not connected", surface the dedicated calm copy. Mixed
    // outcomes fall back to the generic "some messages..." note.
    if (failures === pending.length && notConnectedHits === pending.length) {
      setStatus("not-connected");
    } else {
      setStatus("done");
    }
  }, [cache, channel, conversationId, language, messages]);

  const value = useMemo<TranslationCtx>(
    () => ({
      language,
      setLanguage,
      visible,
      setVisible,
      status,
      failureCount,
      hasAnyCached,
      translateAll,
      getTranslation,
    }),
    [
      language,
      setLanguage,
      visible,
      status,
      failureCount,
      hasAnyCached,
      translateAll,
      getTranslation,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useConversationTranslation(): TranslationCtx | null {
  return useContext(Ctx);
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export function ConversationTranslationBar() {
  const ctx = useConversationTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

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

  if (!ctx) return null;

  const {
    language,
    setLanguage,
    visible,
    setVisible,
    status,
    failureCount,
    hasAnyCached,
    translateAll,
  } = ctx;

  const isLoading = status === "loading";

  return (
    <div className="flex flex-col gap-1.5 border-b border-[#e8eaed] bg-[#f8f9fa] px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5f6368]">
          <Languages className="h-3.5 w-3.5" />
          Translate conversation
        </span>

        {/* Language popover. Compact pill matching the inbox header style. */}
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            aria-label={`Translation language: ${language}. Click to change.`}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-[#dadce0] bg-white px-2.5 py-0.5 text-[11.5px] font-medium text-[#202124] hover:bg-[#f1f3f4] md:min-h-0"
          >
            {language}
            <ChevronDown className="h-3 w-3" />
          </button>
          {pickerOpen && (
            <div
              role="listbox"
              aria-label="Translation language"
              className="absolute left-0 z-20 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-[#e2e8f0] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
            >
              {TRANSLATION_LANGUAGES.map((lang) => {
                const selected = lang === language;
                return (
                  <button
                    key={lang}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setLanguage(lang);
                      setPickerOpen(false);
                    }}
                    className={cn(
                      "flex min-h-[40px] w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] md:min-h-0",
                      selected
                        ? "bg-[#f0f6ff] font-semibold text-[#0b3b8c]"
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

        {/* Translate action. Disabled while a run is in flight. */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          type="button"
          onClick={() => {
            void translateAll();
          }}
          disabled={isLoading}
          className={cn(
            "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-0.5 text-[11.5px] font-semibold transition-colors md:min-h-0",
            "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8] hover:bg-[#d2e3fc]",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Translating...
            </>
          ) : (
            <>
              <Languages className="h-3.5 w-3.5" />
              Translate
            </>
          )}
        </motion.button>

        {/* Show / hide all translations. Only meaningful once at least one
            translation has been cached, so we hide it until then. */}
        {hasAnyCached && (
          <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-[11.5px] text-[#5f6368]">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[#dadce0] text-[#1a73e8] focus:ring-[#1a73e8]"
            />
            Show translations
          </label>
        )}
      </div>

      {/* Status helper line. Kept tiny so the bar stays compact. */}
      {isLoading && (
        <p className="text-[11px] text-[#5f6368]">Translating conversation...</p>
      )}
      {status === "done" && failureCount > 0 && (
        <p className="text-[11px] text-[#a06800]">
          Some messages could not be translated.
        </p>
      )}
      {status === "not-connected" && (
        <p className="text-[11px] text-[#0b3b8c]">
          Translation will be connected by the Unboks team.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-message inline view
// ---------------------------------------------------------------------------

interface MessageTranslationViewProps {
  messageId: string;
  /** Optional align hint for chat-bubble layouts; "card" leaves alignment
   *  to the parent. */
  align?: "left" | "right" | "card";
}

export function MessageTranslationView({
  messageId,
  align = "card",
}: MessageTranslationViewProps) {
  const ctx = useConversationTranslation();
  if (!ctx) return null;
  const result = ctx.getTranslation(messageId);
  if (!result) return null;

  const wrapper = (
    <div
      className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2"
      role="region"
      aria-label={`Message translated to ${result.language}`}
    >
      <span className="mb-1 inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#64748b]">
        <Languages className="h-3 w-3" />
        Translated to {result.language}
      </span>
      <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.5] text-[#1f2937]">
        {result.text}
      </p>
    </div>
  );

  if (align === "card") return <div className="mt-2">{wrapper}</div>;
  return (
    <div
      className={cn(
        "mt-1.5 flex w-full max-w-[75%]",
        align === "right" ? "justify-end self-end" : "justify-start self-start",
      )}
    >
      <div className="w-full">{wrapper}</div>
    </div>
  );
}
