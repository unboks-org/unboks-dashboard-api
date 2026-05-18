/**
 * AI Editor modal — Translate / Style / Fix.
 *
 * Premium SaaS reference patterns: Grammarly's tone rewrite drawer, Intercom AI
 * compose modal, Apple Writing Tools sheet. Centered on desktop, bottom sheet
 * feel on mobile (full-width, generous padding).
 *
 * The panel never sends, never overwrites the operator draft on its own. The
 * operator sees a side-by-side "Original" / "Edited" preview and chooses
 * Apply or Cancel. If the backend isn't connected (status 0/404/501/503),
 * a calm notice replaces the result area and the original draft stays intact.
 *
 * Strict copy rule: no em dashes anywhere in this file's user-facing text.
 */

import { useEffect, useState } from "react";
import { Sparkles, Languages, Wand2, CheckCircle2, X, Loader2 } from "lucide-react";
import { useAIEditor } from "@/hooks/use-client-api";
import { ApiError } from "@/lib/error";
import { motion, AnimatePresence } from "framer-motion";
import type {
  AIEditorAction,
  AIEditorLanguage,
  AIEditorStyle,
  AIEditorContext,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const LANGUAGES: AIEditorLanguage[] = [
  "English",
  "Dutch",
  "Spanish",
  "Papiamento",
  "Swedish",
  "Portuguese",
];

const STYLES: { value: AIEditorStyle; label: string; hint: string }[] = [
  { value: "professional", label: "Professional", hint: "Clean, polished, businesslike. No filler." },
  { value: "warmer", label: "Warmer", hint: "More human, caring and personal." },
  { value: "shorter", label: "Shorter", hint: "Fewer words. Keep only what matters." },
  { value: "friendlier", label: "Friendlier", hint: "Light, casual and approachable." },
  { value: "direct", label: "More direct", hint: "Plain and concise. No fluff." },
];

const TABS: { value: AIEditorAction; label: string; Icon: typeof Sparkles }[] = [
  { value: "translate", label: "Translate", Icon: Languages },
  { value: "style", label: "Style", Icon: Wand2 },
  { value: "fix", label: "Fix", Icon: CheckCircle2 },
];

const NOT_CONNECTED_STATUSES = new Set([0, 404, 501, 503]);
const NOT_CONNECTED_COPY = "Agent Editor will be connected by the Unboks team.";

interface AIEditorPanelProps {
  open: boolean;
  onClose: () => void;
  draftText: string;
  onApply: (newText: string) => void;
  context?: AIEditorContext;
  /**
   * When true, render as a flex-fill block with no backdrop and no fixed
   * positioning. Use this when the panel is rendered INSIDE an existing
   * modal (e.g. Radix Dialog) so it does not clash with the host modal's
   * focus trap, overlay, or transform-clipped containing block.
   *
   * The host is responsible for sizing the parent container (e.g. give the
   * DialogContent `flex flex-col max-h-[85vh]`).
   */
  inline?: boolean;
}

export function AIEditorPanel({
  open,
  onClose,
  draftText,
  onApply,
  context,
  inline = false,
}: AIEditorPanelProps) {
  const [tab, setTab] = useState<AIEditorAction>("fix");
  const [language, setLanguage] = useState<AIEditorLanguage>("English");
  const [style, setStyle] = useState<AIEditorStyle>("professional");
  const [edited, setEdited] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  // Operator can edit the source text inside the panel before generating.
  // Initialised from the parent draft each time the panel opens.
  const [originalDraft, setOriginalDraft] = useState<string>(draftText);

  const ai = useAIEditor();

  // Reset transient state every time the panel reopens. We intentionally do
  // NOT clear the operator's draft — that lives in the parent composer.
  useEffect(() => {
    if (!open) return;
    setEdited(null);
    setErrorText(null);
    setNotConnected(false);
    setOriginalDraft(draftText);
    ai.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const trimmed = originalDraft.trim();
  const canGenerate = trimmed.length > 0 && !ai.isPending;

  const generate = () => {
    if (!canGenerate) return;
    setErrorText(null);
    setNotConnected(false);
    setEdited(null);
    ai.mutate(
      {
        action: tab,
        text: trimmed,
        targetLanguage: tab === "translate" ? language : undefined,
        style: tab === "style" ? style : undefined,
        context,
      },
      {
        onSuccess: (res) => {
          // Defensive: backend may return empty / weird shape. Treat blank as
          // a soft failure rather than wiping the preview area.
          const next = (res?.text ?? "").trim();
          if (!next) {
            setErrorText("The editor returned an empty result. Try again.");
            return;
          }
          setEdited(stripEmDashes(next));
        },
        onError: (err) => {
          if (err instanceof ApiError && NOT_CONNECTED_STATUSES.has(err.status)) {
            setNotConnected(true);
            return;
          }
          // Network / fetch failure surfaces as a non-ApiError; treat as
          // "not connected" so the operator sees the calm placeholder.
          if (!(err instanceof ApiError)) {
            setNotConnected(true);
            return;
          }
          setErrorText(err.message || "Couldn't generate. Try again.");
        },
      },
    );
  };

  const apply = () => {
    if (!edited) return;
    onApply(edited);
    onClose();
  };

  // The panel content is identical for overlay and inline modes; only the
  // outer wrapper differs. Inline mode is used when the panel is rendered
  // inside an existing modal (e.g. Radix Dialog) — no backdrop, no fixed
  // positioning, no rounded card chrome (the host dialog provides those).
  // The host must give the panel a bounded parent so the body can scroll.
  const panel = (
    <div
      className={cn(
        "flex flex-col bg-white",
        inline
          ? // Fill the host container; no chrome, no max-height.
            "h-full min-h-0 w-full overflow-hidden"
          : // Standalone overlay card.
            "w-full md:w-[560px] max-w-[96vw] shadow-2xl rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-hidden border border-[#e8eaed]",
      )}
    >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#f1f3f4]">
          <Sparkles className="w-4 h-4 text-[#1a73e8]" />
          <h2 className="text-[14px] font-semibold text-[#202124] flex-1">Agent Editor</h2>
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="button"
            onClick={onClose}
            aria-label="Close Agent Editor"
            className="grid h-7 w-7 place-items-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4] transition-colors"
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 pt-2 border-b border-[#f1f3f4]">
          {TABS.map(({ value, label, Icon }) => {
            const active = tab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTab(value);
                  setEdited(null);
                  setErrorText(null);
                  setNotConnected(false);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-t-md transition-all active:scale-[0.97]",
                  active
                    ? "text-[#1a73e8] border-b-2 border-[#1a73e8] -mb-px bg-white"
                    : "text-[#5f6368] hover:text-[#202124] hover:bg-[#f6f8fc]",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Per-tab controls */}
          {tab === "translate" && (
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[#5f6368]">
                Target language
              </label>
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGES.map((lang) => {
                  const selected = language === lang;
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setLanguage(lang)}
                      className={cn(
                        "px-2.5 py-1 text-[12px] rounded-full border transition-colors",
                        selected
                          ? "bg-[#e8f0fe] border-[#1a73e8] text-[#1a73e8] font-medium"
                          : "bg-white border-[#dadce0] text-[#5f6368] hover:bg-[#f6f8fc]",
                      )}
                    >
                      {lang}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "style" && (
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[#5f6368]">
                Tone and style
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {STYLES.map((s) => {
                  const selected = style === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStyle(s.value)}
                      className={cn(
                        "text-left px-3 py-2 rounded-md border transition-colors",
                        selected
                          ? "bg-[#e8f0fe] border-[#1a73e8]"
                          : "bg-white border-[#dadce0] hover:bg-[#f6f8fc]",
                      )}
                    >
                      <p
                        className={cn(
                          "text-[12px] font-medium",
                          selected ? "text-[#1a73e8]" : "text-[#202124]",
                        )}
                      >
                        {s.label}
                      </p>
                      <p className="text-[11px] text-[#5f6368] mt-0.5">{s.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "fix" && (
            <p className="text-[12px] text-[#5f6368]">
              Fix corrects spelling, grammar, and clarity while preserving meaning and tone.
            </p>
          )}

          {/* Original — editable. Operator can refine the source before
              generating. Generate uses this updated text. Apply still
              writes the AI-edited result back to the parent composer. */}
          <div className="space-y-1">
            <label
              htmlFor="ai-editor-original"
              className="block text-[11px] uppercase tracking-wide text-[#9aa0a6] font-medium"
            >
              Original (editable)
            </label>
            <textarea
              id="ai-editor-original"
              value={originalDraft}
              onChange={(e) => {
                setOriginalDraft(e.target.value);
                // Editing the source invalidates any prior AI result.
                if (edited) setEdited(null);
                if (errorText) setErrorText(null);
              }}
              placeholder="Write something here, or in the composer first."
              disabled={ai.isPending}
              rows={3}
              className="block w-full resize-y rounded-md border border-[#e8eaed] bg-[#f8f9fa] px-3 py-2 text-[13px] text-[#202124] min-h-[60px] max-h-[200px] overflow-y-auto focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30 focus:border-[#1a73e8] disabled:opacity-60"
            />
          </div>

          {/* Result / status */}
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-[#9aa0a6] font-medium">
              Edited
            </p>
            {ai.isPending && (
              <div className="rounded-md border border-[#e8eaed] bg-white px-3 py-3 flex items-center gap-2 text-[13px] text-[#5f6368] min-h-[60px]">
                <Loader2 className="w-4 h-4 animate-spin text-[#1a73e8]" />
                Working on it...
              </div>
            )}
            {!ai.isPending && notConnected && (
              <div className="rounded-md border border-[#fde293] bg-[#fef7e0] px-3 py-3 text-[13px] text-[#5f3e00] min-h-[60px]">
                {NOT_CONNECTED_COPY}
              </div>
            )}
            {!ai.isPending && !notConnected && errorText && (
              <div className="rounded-md border border-[#f6c6c2] bg-[#fce8e6] px-3 py-3 text-[13px] text-[#5f1414] min-h-[60px]">
                {errorText}
              </div>
            )}
            {!ai.isPending && !notConnected && !errorText && edited && (
              <div className="rounded-md border border-[#cfe2ff] bg-[#f0f6ff] px-3 py-2 text-[13px] text-[#202124] whitespace-pre-wrap min-h-[60px] max-h-[200px] overflow-y-auto">
                {edited}
              </div>
            )}
            {!ai.isPending && !notConnected && !errorText && !edited && (
              <div className="rounded-md border border-dashed border-[#dadce0] bg-white px-3 py-3 text-[13px] text-[#9aa0a6] min-h-[60px]">
                Click Generate to see the edited version.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-[#f1f3f4] bg-white flex-wrap">
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            className="px-3 py-1.5 text-[13px] font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1765cc] disabled:bg-[#dadce0] disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {ai.isPending ? "Generating..." : edited ? "Regenerate" : "Generate"}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!edited || ai.isPending}
            className="px-3 py-1.5 text-[13px] font-medium text-[#202124] bg-white border border-[#dadce0] rounded-md hover:bg-[#f6f8fc] disabled:text-[#9aa0a6] disabled:cursor-not-allowed"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-3 py-1.5 text-[13px] text-[#5f6368] hover:bg-[#f1f3f4] rounded-md"
          >
            Cancel
          </button>
        </div>
      </div>
  );

  if (inline) return panel;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[#202124]/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Agent Editor"
      onMouseDown={(e) => {
        // Click outside to close, but only on the backdrop itself.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {panel}
    </div>
  );
}

/**
 * Belt-and-suspenders: if the model returns an em dash anyway, replace it
 * with a comma + space. Brand rule applies to ALL surfaced text.
 */
function stripEmDashes(text: string): string {
  return text.replace(/\s*[\u2014\u2015]\s*/g, ", ");
}
