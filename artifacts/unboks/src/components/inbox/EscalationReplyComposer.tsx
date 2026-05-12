/**
 * Escalation Reply Composer.
 *
 * Two visually and textually distinct modes, deliberately not unified into a
 * single ambiguous "Reply" box:
 *
 *  - Soft escalation: operator writes guidance to Marina (the AI). Marina
 *    will use it to answer the customer. Primary action: "Send to Marina".
 *    This composer must never imply the customer was messaged directly.
 *
 *  - Hard escalation: operator writes a reply directly to the customer. AI
 *    is muted. Primary action: "Reply to customer". A small "Human takeover"
 *    or "AI muted" pill makes the state explicit.
 *
 * Only hard escalation embeds the AI Editor (Translate / Style / Fix). In
 * soft mode the operator is writing internal guidance to Marina, not a
 * customer-facing reply, so AI rewriting would be off-purpose; the AI Editor
 * button and panel are hidden entirely.
 *
 * If a send endpoint isn't connected (status 0 / 404 / 501 / 503), the
 * composer shows the calm fallback copy specified by product:
 *
 *   Soft: "Saved. Marina connection will be completed by the Unboks team."
 *   Hard: "Direct customer reply will be connected by the Unboks team."
 *
 * Imperative handle
 * -----------------
 * Exposed via `forwardRef` so the parent (Inbox) can let the Escalation
 * Reason chips drive the composer without lifting all of its state up:
 *
 *   - `insertOrAppend(text)` — fills the textarea with `text` when empty,
 *     otherwise appends after a blank line. Operator drafts are never
 *     erased silently. Focus + caret move to the end of the inserted text.
 *   - `focus()` — focus the textarea (used for chips that are pure actions
 *     and shouldn't change the draft).
 *   - `markResolved()` — same code path as the visible "Mark resolved"
 *     button, so the chip and the button share behavior including any
 *     pending-state guard.
 *   - `takeover()` — switches to human takeover via the existing escalation
 *     mutation; the composer mode flips to "hard" once the parent re-renders
 *     with the new mode.
 *   - `handback()` — symmetrical hand-back-to-Marina action (hard → soft).
 *
 * Chips never auto-send. The operator must still click "Send to Marina" or
 * "Reply to customer" to dispatch the message.
 *
 * Strict copy rule: no em dashes anywhere in this file's user-facing text.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Sparkles, VolumeX, Undo2, Send, Check } from "lucide-react";
import { useConfig, useEscalationMutations } from "@/hooks/use-client-api";
import { ApiError } from "@/lib/error";
import type { Channel } from "@/data/conversations";
import { cn } from "@/lib/utils";
import { AIEditorPanel } from "./AIEditorPanel";
import {
  openPendingLearnings,
  shouldShowInlineLearningConfirmation,
} from "@/lib/learning-confirmation";

const NOT_CONNECTED_STATUSES = new Set([0, 404, 501, 503]);

export interface EscalationReplyComposerHandle {
  /**
   * If the composer is empty, set the draft to `text`. Otherwise append
   * `text` after a blank line. Focuses the textarea and moves the caret
   * to the end so the operator can keep typing.
   */
  insertOrAppend: (text: string) => void;
  focus: () => void;
  markResolved: () => void;
  takeover: () => void;
  handback: () => void;
}

interface EscalationReplyComposerProps {
  /** DB id of the escalation row, used by the escalation endpoints. */
  conversationDbId: string;
  /** Phone / external id of the conversation, passed as AI Editor context. */
  conversationId: string;
  mode: "soft" | "hard";
  channel: Channel;
  aiMuted?: boolean;
  onDone: () => void;
}

export const EscalationReplyComposer = forwardRef<
  EscalationReplyComposerHandle,
  EscalationReplyComposerProps
>(function EscalationReplyComposer(
  {
    conversationDbId,
    conversationId,
    mode,
    channel,
    aiMuted = false,
    onDone,
  },
  ref,
) {
  const [draft, setDraft] = useState("");
  const [prevDraft, setPrevDraft] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "info" | "warning" | "error";
    text: string;
  } | null>(null);
  const [learningConfirmationVisible, setLearningConfirmationVisible] = useState(false);
  // Tracks the combined "Send + resolve" / "Reply + resolve" flow so the
  // primary button can show step-aware loading copy ("Sending..." then
  // "Resolving...") and so we can disable the secondary actions while the
  // two-step sequence is in flight. We can't rely solely on the
  // individual mutation `isPending` flags because resolve's pending state
  // is also true when the operator clicks the standalone Mark resolved
  // button.
  const [combinedStep, setCombinedStep] = useState<null | "sending" | "resolving">(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Mirror the latest draft into a ref so the imperative handle exposed
  // to the Escalation Reason chips always reads the current text — even
  // though `useImperativeHandle` itself memoises across renders. This
  // matters most for hard-mode "Mark resolved", which sends the trimmed
  // draft as the resolutionNote, and for "Switch to human takeover" /
  // "Hand back" notice copy.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const isSoftRef = useRef(mode === "soft");
  useEffect(() => {
    isSoftRef.current = mode === "soft";
  }, [mode]);

  const { data: config } = useConfig();
  const { guidance, reply, resolve, takeover, handback } = useEscalationMutations();
  const isSoft = mode === "soft";
  const canShowLearningConfirmation = shouldShowInlineLearningConfirmation(config);

  // When the operator toggles soft/hard we deliberately keep `draft` and
  // `prevDraft` so an in-progress message survives the switch. We do reset
  // the AI panel and any stale per-action notice, since both are tied to the
  // previous mode's intent (notices say "Saved..." vs "Reply will be...";
  // the AI panel makes no sense in soft mode).
  useEffect(() => {
    setAiOpen(false);
    setNotice(null);
    setLearningConfirmationVisible(false);
  }, [mode]);
  const empty = draft.trim().length === 0;
  const sendPending = isSoft ? guidance.isPending : reply.isPending;
  const combinedPending = combinedStep !== null;
  // While a combined flow is running, every action button is disabled to
  // avoid double-submits and racing mutations against each other.
  const anyPending =
    sendPending ||
    resolve.isPending ||
    takeover.isPending ||
    handback.isPending ||
    combinedPending;

  const onApplyEdit = (next: string) => {
    setPrevDraft(draft);
    setDraft(next);
    setNotice(null);
    setLearningConfirmationVisible(false);
  };

  const onUndo = () => {
    if (prevDraft === null) return;
    setDraft(prevDraft);
    setPrevDraft(null);
  };

  const onSend = () => {
    if (empty || sendPending) return;
    setNotice(null);
    setLearningConfirmationVisible(false);
    const trimmed = draft.trim();

    if (isSoft) {
      guidance.mutate(
        {
          id: conversationDbId,
          payload: { guidance: trimmed },
        },
        {
          onSuccess: () => {
            setDraft("");
            setPrevDraft(null);
            showLearningConfirmationOrFinish();
          },
          onError: (err) => {
            if (isNotConnected(err)) {
              setNotice({
                tone: "info",
                text: "Saved. Agent connection will be completed by the Unboks team.",
              });
              return;
            }
            setNotice({
              tone: "error",
              text:
                "Couldn't send guidance: " +
                (err instanceof Error ? err.message : "Unknown error"),
            });
          },
        },
      );
      return;
    }

    // Hard escalation: direct customer reply.
    reply.mutate(
      { id: conversationDbId, message: trimmed },
      {
        onSuccess: () => {
          setDraft("");
          setPrevDraft(null);
          showLearningConfirmationOrFinish();
        },
        onError: (err) => {
          if (isNotConnected(err)) {
            setNotice({
              tone: "info",
              text: "Direct customer reply will be connected by the Unboks team.",
            });
            return;
          }
          setNotice({
            tone: "error",
            text:
              "Couldn't send reply: " +
              (err instanceof Error ? err.message : "Unknown error"),
          });
        },
      },
    );
  };

  /**
   * Combined Send + resolve flow.
   *
   * Two sequential mutations: first the send (guidance in soft / reply in
   * hard), then resolve. Strict rules from product:
   *
   *   - If send fails: do NOT call resolve. Show "Could not send.
   *     Escalation was not resolved." (or the calm fallback when the
   *     endpoint is not connected).
   *   - If send succeeds but resolve fails: show "Message sent, but
   *     escalation was not marked resolved." We do not lie about the
   *     resolved state.
   *   - Only on full success do we clear the draft and call onDone.
   *
   * The resolve payload always carries the learning fields the spec
   * requires (saveAsLearning + autoUseNextTime + category). In hard mode
   * we also pass the operator's reply as the resolutionNote so the
   * resolution record reflects what the customer was told.
   */
  const onSendAndResolve = () => {
    if (empty || anyPending) return;
    setNotice(null);
    setLearningConfirmationVisible(false);
    const trimmed = draft.trim();

    const runResolve = () => {
      setCombinedStep("resolving");
      resolve.mutate(
        {
          id: conversationDbId,
          payload: {
            saveAsLearning: true,
            autoUseNextTime: true,
            category: "escalation_reply",
            resolutionNote: isSoft ? undefined : trimmed,
          },
        },
        {
          onSuccess: () => {
            setCombinedStep(null);
            setDraft("");
            setPrevDraft(null);
            showLearningConfirmationOrFinish();
          },
          onError: (err) => {
            setCombinedStep(null);
            // Send already succeeded; we must not pretend resolve also
            // worked. Clear the draft anyway since the message did go
            // out, then surface a partial-success warning.
            setDraft("");
            setPrevDraft(null);
            if (isNotConnected(err)) {
              setNotice({
                tone: "warning",
                text:
                  "Message sent. Mark resolved will be connected by the Unboks team.",
              });
              return;
            }
            setNotice({
              tone: "warning",
              text:
                "Message sent, but escalation was not marked resolved: " +
                (err instanceof Error ? err.message : "Unknown error"),
            });
          },
        },
      );
    };

    setCombinedStep("sending");
    if (isSoft) {
      guidance.mutate(
        { id: conversationDbId, payload: { guidance: trimmed } },
        {
          onSuccess: runResolve,
          onError: (err) => {
            setCombinedStep(null);
            if (isNotConnected(err)) {
              // Send endpoint not connected. Per product spec, we keep
              // the calm placeholder wording for missing endpoints, but
              // for the combined action we also state explicitly that
              // the escalation was not resolved so the operator isn't
              // misled into thinking the second step ran.
              setNotice({
                tone: "info",
                text:
                  "Saved. Agent connection will be completed by the Unboks team. Escalation was not resolved.",
              });
              return;
            }
            setNotice({
              tone: "error",
              text: "Could not send. Escalation was not resolved.",
            });
          },
        },
      );
      return;
    }

    reply.mutate(
      { id: conversationDbId, message: trimmed },
      {
        onSuccess: runResolve,
        onError: (err) => {
          setCombinedStep(null);
          if (isNotConnected(err)) {
            setNotice({
              tone: "info",
              text:
                "Direct customer reply will be connected by the Unboks team. Escalation was not resolved.",
            });
            return;
          }
          setNotice({
            tone: "error",
            text: "Could not send. Escalation was not resolved.",
          });
        },
      },
    );
  };

  const onMarkResolved = () => {
    if (resolve.isPending) return;
    // Read draft + mode from refs so this handler stays correct when
    // invoked via the imperative handle (which is memoised across
    // renders). Without this, a chip click could send a stale resolution
    // note in hard mode.
    const currentDraft = draftRef.current;
    const currentIsSoft = isSoftRef.current;
    resolve.mutate(
      {
        id: conversationDbId,
        payload: currentIsSoft
          ? {}
          : { resolutionNote: currentDraft.trim() || undefined },
      },
      {
        onSuccess: onDone,
        onError: (err) => {
          if (isNotConnected(err)) {
            setNotice({
              tone: "info",
              text: "Mark resolved will be connected by the Unboks team.",
            });
            return;
          }
          setNotice({
            tone: "error",
            text:
              "Couldn't mark resolved: " +
              (err instanceof Error ? err.message : "Unknown error"),
          });
        },
      },
    );
  };

  const onTakeover = () => {
    if (takeover.isPending) return;
    takeover.mutate(
      { id: conversationDbId },
      {
        onSuccess: onDone,
        onError: (err) => {
          if (isNotConnected(err)) {
            setNotice({
              tone: "info",
              text: "Switch to human takeover will be connected by the Unboks team.",
            });
            return;
          }
          setNotice({
            tone: "error",
            text:
              "Couldn't switch to human takeover: " +
              (err instanceof Error ? err.message : "Unknown error"),
          });
        },
      },
    );
  };

  const onHandback = () => {
    if (handback.isPending) return;
    handback.mutate(
      { id: conversationDbId },
      {
        onSuccess: onDone,
        onError: (err) => {
          if (isNotConnected(err)) {
            setNotice({
              tone: "info",
              text: "Hand back to Agent will be connected by the Unboks team.",
            });
            return;
          }
          setNotice({
            tone: "error",
            text:
              "Couldn't hand back to Agent: " +
              (err instanceof Error ? err.message : "Unknown error"),
          });
        },
      },
    );
  };

  // Imperative handle exposed to the Escalation Reason chips. We
  // deliberately do not wrap these in mode-specific guards: the parent
  // already routes chip clicks based on the current mode, and the
  // mutation hooks themselves enforce server-side correctness.
  useImperativeHandle(
    ref,
    () => ({
      insertOrAppend(text: string) {
        const incoming = text.trim();
        if (!incoming) return;
        let nextDraft = "";
        setDraft((current) => {
          nextDraft = current.trim().length === 0
            ? incoming
            : `${current.replace(/\s+$/u, "")}\n\n${incoming}`;
          return nextDraft;
        });
        setNotice(null);
        // Defer focus until after React commits the new value, otherwise
        // the caret jumps to position 0 on some browsers.
        requestAnimationFrame(() => {
          const ta = textareaRef.current;
          if (!ta) return;
          ta.focus();
          const end = nextDraft.length;
          try {
            ta.setSelectionRange(end, end);
          } catch {
            // Some environments throw when the textarea isn't in the DOM
            // yet — safe to ignore.
          }
        });
      },
      focus() {
        textareaRef.current?.focus();
      },
      markResolved: onMarkResolved,
      takeover: onTakeover,
      handback: onHandback,
    }),
    // The handlers above close over fresh `draft` / mode via setState
    // updaters and the latest mutation hook objects, so we only need to
    // refresh the handle when those identities change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationDbId, mode, resolve, takeover, handback],
  );

  const headingText = isSoft ? "Instructions to Agent" : "Reply to customer";
  const helperText = isSoft
    ? "Tell the Agent exactly what to say or do next."
    : "This reply will be sent directly to the customer.";
  const placeholder = isSoft
    ? "Example: Confirm Sunday at 08:00 and ask the customer to confirm their phone number."
    : "Write your reply...";
  const sendLabel = isSoft ? "Send to Agent" : "Reply to customer";

  const showLearningConfirmationOrFinish = () => {
    if (canShowLearningConfirmation) {
      setLearningConfirmationVisible(true);
      return;
    }
    onDone();
  };

  return (
    <div
      className="border-t border-[#e8eaed] bg-white px-3 sm:px-4 pt-2.5 space-y-2 flex-shrink-0"
      style={{
        // iOS Safari safe-area: keep the action row above the browser
        // chrome / home indicator. Falls back to a comfortable 14px on
        // platforms without safe-area-inset support.
        paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* Compact heading. The mode/status indicator already lives in the
          Decision Needed card above and in the conversation header, so we
          deliberately do NOT repeat "Soft escalation" / "Agent needs help"
          here. In hard mode we keep a small "Agent muted" hint because
          that's a state that ONLY matters at the composer (it changes
          what happens after Send), not in the header. */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-semibold text-[#111827]">{headingText}</p>
          {!isSoft && aiMuted && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#f1f3f4] text-[10.5px] text-[#5f6368]">
              <VolumeX className="w-2.5 h-2.5" />
              Agent muted
            </span>
          )}
        </div>
      </div>
      <p className="text-[11.5px] text-[#5f6368]">{helperText}</p>

      {/* Composer */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (notice) setNotice(null);
            if (learningConfirmationVisible) setLearningConfirmationVisible(false);
          }}
          placeholder={placeholder}
          rows={4}
          className={cn(
            "w-full text-[13px] text-[#202124] border rounded-md px-3 py-2 outline-none resize-none transition-colors",
            isSoft
              ? "border-[#dadce0] focus:border-[#1a73e8]"
              : "border-[#dadce0] focus:border-[#c5221f]",
          )}
        />
        {!isSoft && (
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              disabled={empty}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors",
                empty
                  ? "border-[#e8eaed] text-[#9aa0a6] bg-white cursor-not-allowed"
                  : "border-[#1a73e8]/30 text-[#1a73e8] bg-[#f0f6ff] hover:bg-[#e8f0fe]",
              )}
              aria-label="Open Agent Editor"
              title="Agent Editor: Translate, Style, Fix"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Agent Editor
            </button>
            {prevDraft !== null && (
              <button
                type="button"
                onClick={onUndo}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[12px] text-[#5f6368] hover:bg-[#f1f3f4]"
                title="Undo last Agent edit"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Undo edit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Calm fallback / error notice */}
      {notice && (
        <div
          role="status"
          className={cn(
            "rounded-md border px-3 py-2 text-[12px]",
            notice.tone === "info" &&
              "border-[#cfe2ff] bg-[#f0f6ff] text-[#0b3b8c]",
            notice.tone === "warning" &&
              "border-[#fde293] bg-[#fef7e0] text-[#5f3e00]",
            notice.tone === "error" &&
              "border-[#f6c6c2] bg-[#fce8e6] text-[#5f1414]",
          )}
        >
          {notice.text}
        </div>
      )}

      {learningConfirmationVisible && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#dfe6ee] bg-[#fbfcfe] px-3 py-2 text-[12px] text-[#3c4043]"
        >
          <span>Saved as pending learning for review.</span>
          <button
            type="button"
            onClick={openPendingLearnings}
            className="font-medium text-[#1a73e8] hover:underline"
          >
            View pending learnings
          </button>
        </div>
      )}

      {/* Composer action group — single visual row, three peer buttons.
       *
       * Order (locked by spec): Send → Resolve → Send & Resolve.
       *
       *   [ Send ] [ Resolve ] [ Send & Resolve ]      Switch to human takeover
       *
       * Visual hierarchy:
       *   - Send and Resolve are outline secondaries: equal weight,
       *     clearly tappable pills (no tiny text links).
       *   - Send & Resolve is the strongest, premium accent action —
       *     filled blue pill — placed last as the combined final action.
       *
       * Disabled contract:
       *   - Send / Send & Resolve disable when the composer is empty.
       *   - Resolve stays enabled even with an empty composer (resolving
       *     without a reply is a supported product flow).
       *   - All three disable while another action is in flight to avoid
       *     racing the same escalation.
       *
       * Takeover / handback stays on the right, untouched, so operators
       * don't have to re-learn its position.
       */}
      {/* Mobile-only takeover/handback link, placed ABOVE the action
          buttons so it never sits next to the browser chrome where it
          could be mis-tapped. On sm+ the link stays in its original
          position to the right of the button row (below). */}
      {isSoft ? (
        <div className="sm:hidden pt-1">
          <button
            type="button"
            onClick={onTakeover}
            disabled={takeover.isPending || combinedPending}
            className="text-[13px] font-medium text-[#c5221f] hover:underline disabled:opacity-50 disabled:no-underline"
          >
            Switch to human takeover
          </button>
        </div>
      ) : (
        <div className="sm:hidden pt-1">
          <button
            type="button"
            onClick={onHandback}
            disabled={handback.isPending || combinedPending}
            className="text-[13px] font-medium text-[#1a73e8] hover:underline disabled:opacity-50 disabled:no-underline"
          >
            Hand back to Agent
          </button>
        </div>
      )}

      <div
        className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 pt-0.5"
        role="group"
        aria-label={isSoft ? "Escalation guidance actions" : "Escalation reply actions"}
      >
        {/* 1) Send — outline secondary */}
        <button
          type="button"
          onClick={onSend}
          disabled={empty || sendPending || anyPending}
          aria-label={
            isSoft
              ? "Send guidance to your Agent without resolving"
              : "Reply to customer without resolving"
          }
          title={
            isSoft
              ? "Send guidance to your Agent without resolving."
              : "Reply to the customer without resolving."
          }
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 text-[13px] font-medium",
            "border-[#dadce0] bg-white text-[#3c4043]",
            "hover:bg-[#f8f9fa] hover:border-[#bdc1c6] active:bg-[#f1f3f4]",
            "transition-colors shadow-sm",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1",
            "disabled:bg-white disabled:text-[#9aa0a6] disabled:border-[#e8eaed] disabled:shadow-none disabled:cursor-not-allowed",
          )}
        >
          <Send className="h-3.5 w-3.5" />
          {sendPending && !combinedPending ? "Sending..." : "Send"}
        </button>

        {/* 2) Resolve — outline secondary */}
        <button
          type="button"
          onClick={onMarkResolved}
          disabled={anyPending}
          aria-label="Mark this escalation resolved without sending anything"
          title="Mark this escalation resolved without sending anything."
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 text-[13px] font-medium",
            "border-[#dadce0] bg-white text-[#3c4043]",
            "hover:bg-[#f8f9fa] hover:border-[#bdc1c6] active:bg-[#f1f3f4]",
            "transition-colors shadow-sm",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1",
            "disabled:bg-white disabled:text-[#9aa0a6] disabled:border-[#e8eaed] disabled:shadow-none disabled:cursor-not-allowed",
          )}
        >
          <Check className="h-3.5 w-3.5" />
          {resolve.isPending && !combinedPending ? "Resolving..." : "Resolve"}
        </button>

        {/* 3) Send & Resolve — premium combined action.
            On mobile this spans both grid columns so it sits as a
            full-width row beneath Send + Resolve, matching the spec's
            preferred 2-row mobile layout. */}
        <button
          type="button"
          onClick={onSendAndResolve}
          disabled={empty || anyPending}
          aria-label={
            isSoft
              ? "Send guidance and mark resolved"
              : "Reply to customer and mark resolved"
          }
          title={
            isSoft
              ? "Send guidance to your Agent and mark this escalation resolved."
              : "Reply directly to the customer and mark this escalation resolved."
          }
          className={cn(
            "col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-[13.5px] sm:text-[13px] font-semibold sm:font-medium text-white",
            "shadow-sm transition-colors",
            "bg-[#1a73e8] hover:bg-[#1765cc] active:bg-[#185abc]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1",
            "disabled:bg-[#c4c8cf] disabled:text-white disabled:shadow-none disabled:cursor-not-allowed",
          )}
        >
          {combinedStep === "sending" ? (
            <>
              <Send className="h-3.5 w-3.5" />
              Sending...
            </>
          ) : combinedStep === "resolving" ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Resolving...
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              Send &amp; Resolve
              <Check className="h-3.5 w-3.5 opacity-90" />
            </>
          )}
        </button>

        {/* Desktop-only takeover/handback link — mobile renders it
            above the button group instead. */}
        {isSoft ? (
          <button
            type="button"
            onClick={onTakeover}
            disabled={takeover.isPending || combinedPending}
            className="hidden sm:inline ml-auto text-[12px] text-[#c5221f] hover:underline disabled:opacity-50 disabled:no-underline"
          >
            Switch to human takeover
          </button>
        ) : (
          <button
            type="button"
            onClick={onHandback}
            disabled={handback.isPending || combinedPending}
            className="hidden sm:inline ml-auto text-[12px] text-[#1a73e8] hover:underline disabled:opacity-50 disabled:no-underline"
          >
            Hand back to Agent
          </button>
        )}
      </div>

      {/* AI Editor — hard escalation only. Soft mode is internal guidance to
          Marina, so AI rewriting would be off-purpose. */}
      {!isSoft && (
        <AIEditorPanel
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          draftText={draft}
          onApply={onApplyEdit}
          context={{
            conversationId,
            escalationMode: mode,
            channel: channel.toLowerCase(),
          }}
        />
      )}
    </div>
  );
});

function isNotConnected(err: unknown): boolean {
  if (err instanceof ApiError) return NOT_CONNECTED_STATUSES.has(err.status);
  // Network failure / no response — also treat as not connected.
  return !(err instanceof Error) || err.name === "TypeError" || err.message === "Failed to fetch";
}
