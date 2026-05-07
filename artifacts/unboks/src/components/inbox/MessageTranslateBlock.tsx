/**
 * MessageTranslateBlock — per-message inline translation control.
 *
 * Operator-only utility: lets a human read a customer or assistant message in
 * English when the original is in another language. The translated text is
 * rendered inline below the original; the original is never replaced or
 * altered, no payload is sent to the customer, and Marina's reply behavior
 * is unaffected. Translation is cached in this component's local state and
 * re-rendered cheaply, so toggling Hide / Translate again does not re-call
 * the API.
 *
 * UI pattern is modelled on Intercom / Gmail / Slack inline message
 * translation: a small, calm "Translate" trigger that lives near the
 * message and expands to a soft tinted block with a clear "Translated to
 * English" label and a Hide action. No modal, no thread noise.
 *
 * Backend: reuses the existing `/api/{client}/dashboard/api/ai-editor`
 * endpoint with `action: "translate"` (see `aiEditorEdit`). The user-facing
 * label here stays "Translate" — never "AI Editor" — because this is a
 * read-side utility for understanding a message, not a draft-editing tool.
 */

import { useState } from "react";
import { Languages, Loader2, X } from "lucide-react";
import { useMessageTranslation } from "@/hooks/use-client-api";
import { ApiError } from "@/lib/error";
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

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "translated"; text: string }
  | { kind: "hidden"; text: string }
  | { kind: "error"; tone: "info" | "error"; message: string };

export function MessageTranslateBlock({
  messageId,
  text,
  conversationId,
  channel,
  variant = "bubble",
}: MessageTranslateBlockProps) {
  const translate = useMessageTranslation();
  const [state, setState] = useState<State>({ kind: "idle" });

  const trimmed = text?.trim() ?? "";
  if (trimmed.length === 0) return null;

  const onTranslate = () => {
    // Re-using a previously fetched translation: no API call.
    if (state.kind === "hidden") {
      setState({ kind: "translated", text: state.text });
      return;
    }
    if (state.kind === "translated" || state.kind === "loading") return;

    setState({ kind: "loading" });
    translate.mutate(
      {
        text: trimmed,
        targetLanguage: "English",
        context: {
          conversationId,
          messageId,
          channel: channel.toLowerCase(),
          usage: "operator_message_translation",
        },
      },
      {
        onSuccess: (result) => {
          setState({ kind: "translated", text: result.text });
        },
        onError: (err) => {
          if (isNotConnected(err)) {
            setState({
              kind: "error",
              tone: "info",
              message: "Translation will be connected by the Unboks team.",
            });
            return;
          }
          if (err instanceof ApiError && err.status >= 500) {
            setState({
              kind: "error",
              tone: "error",
              message: "Could not translate this message. Try again.",
            });
            return;
          }
          // 401/403 are handled globally by the auth layer; for anything else
          // surface a calm generic message and keep the original intact.
          setState({
            kind: "error",
            tone: "error",
            message: "Could not translate this message. Try again.",
          });
        },
      },
    );
  };

  const onHide = () => {
    if (state.kind === "translated") {
      setState({ kind: "hidden", text: state.text });
    } else if (state.kind === "error") {
      setState({ kind: "idle" });
    }
  };

  const triggerLabel =
    state.kind === "loading"
      ? "Translating…"
      : state.kind === "hidden"
        ? "Show translation"
        : "Translate";

  // Only show the trigger when there's nothing to hide. The "Hide
  // translation" link lives inside the result block for visual proximity.
  const showTrigger =
    state.kind === "idle" || state.kind === "loading" || state.kind === "hidden";

  const triggerClass =
    variant === "bubble"
      ? cn(
          "mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium opacity-70 transition-opacity hover:opacity-100",
          // Inherit color from the bubble; underline-on-hover keeps it calm.
          "hover:underline disabled:cursor-not-allowed",
        )
      : cn(
          "mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white px-2.5 py-1 text-[11.5px] font-medium text-[#475569] transition-colors hover:border-[#cbd5e1] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60",
        );

  return (
    <>
      {showTrigger && (
        <div className={variant === "bubble" ? "" : ""}>
          <button
            type="button"
            onClick={onTranslate}
            disabled={state.kind === "loading"}
            title="Translate message"
            aria-label="Translate message to English"
            className={triggerClass}
          >
            {state.kind === "loading" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Languages className="h-3 w-3" />
            )}
            {triggerLabel}
          </button>
        </div>
      )}

      {state.kind === "translated" && (
        <div
          className={cn(
            "mt-2 rounded-lg border bg-[#f8fafc] px-3 py-2",
            "border-[#e2e8f0]",
          )}
          role="region"
          aria-label="Translated message"
        >
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#64748b]">
              <Languages className="h-3 w-3" />
              Translated to English
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
            {state.text}
          </p>
        </div>
      )}

      {state.kind === "error" && (
        <div
          role="status"
          className={cn(
            "mt-2 rounded-lg border px-3 py-2 text-[12px]",
            state.tone === "info"
              ? "border-[#cfe2ff] bg-[#f0f6ff] text-[#0b3b8c]"
              : "border-[#f6c6c2] bg-[#fce8e6] text-[#5f1414]",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{state.message}</span>
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
