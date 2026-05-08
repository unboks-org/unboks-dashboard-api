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
import { Sparkles, VolumeX, User, Bot, Undo2 } from "lucide-react";
import { useEscalationMutations } from "@/hooks/use-client-api";
import { ApiError } from "@/lib/error";
import type { Channel } from "@/data/conversations";
import { cn } from "@/lib/utils";
import { AIEditorPanel } from "./AIEditorPanel";

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

  const { guidance, reply, resolve, takeover, handback } = useEscalationMutations();
  const isSoft = mode === "soft";

  // When the operator toggles soft/hard we deliberately keep `draft` and
  // `prevDraft` so an in-progress message survives the switch. We do reset
  // the AI panel and any stale per-action notice, since both are tied to the
  // previous mode's intent (notices say "Saved..." vs "Reply will be...";
  // the AI panel makes no sense in soft mode).
  useEffect(() => {
    setAiOpen(false);
    setNotice(null);
  }, [mode]);
  const empty = draft.trim().length === 0;
  const sendPending = isSoft ? guidance.isPending : reply.isPending;

  const onApplyEdit = (next: string) => {
    setPrevDraft(draft);
    setDraft(next);
    setNotice(null);
  };

  const onUndo = () => {
    if (prevDraft === null) return;
    setDraft(prevDraft);
    setPrevDraft(null);
  };

  const onSend = () => {
    if (empty || sendPending) return;
    setNotice(null);
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
            onDone();
          },
          onError: (err) => {
            if (isNotConnected(err)) {
              setNotice({
                tone: "info",
                text: "Saved. Marina connection will be completed by the Unboks team.",
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
          onDone();
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
              text: "Hand back to Marina will be connected by the Unboks team.",
            });
            return;
          }
          setNotice({
            tone: "error",
            text:
              "Couldn't hand back to Marina: " +
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

  const headingText = isSoft ? "Reply to Marina" : "Reply to customer";
  const helperText = isSoft
    ? "Marina will use your guidance to answer the customer."
    : "This reply will be sent directly to the customer.";
  const placeholder = isSoft
    ? "Write guidance for Marina..."
    : "Write your reply...";
  const sendLabel = isSoft ? "Send to Marina" : "Reply to customer";

  return (
    <div className="border-t border-[#e8eaed] bg-white px-4 py-2.5 space-y-2 flex-shrink-0">
      {/* Compact heading: title on the left, mode badge inline on the right.
          Replaces the previous two-row layout (badge above, title below) so
          the composer feels premium and gives the message thread more
          vertical space. */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-semibold text-[#202124]">{headingText}</p>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-medium",
              isSoft
                ? "bg-[#fef7e0] text-[#5f3e00] border border-[#feefc3]"
                : "bg-[#fce8e6] text-[#5f1414] border border-[#f6c6c2]",
            )}
          >
            {isSoft ? <Bot className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
            {isSoft ? "Soft escalation" : "Human takeover"}
          </span>
          {!isSoft && aiMuted && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#f1f3f4] text-[10.5px] text-[#5f6368]">
              <VolumeX className="w-2.5 h-2.5" />
              AI muted
            </span>
          )}
        </div>
      </div>
      <p className="text-[11px] text-[#5f6368]">{helperText}</p>

      {/* Composer */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (notice) setNotice(null);
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
              aria-label="Open AI Editor"
              title="AI Editor: Translate, Style, Fix"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Editor
            </button>
            {prevDraft !== null && (
              <button
                type="button"
                onClick={onUndo}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[12px] text-[#5f6368] hover:bg-[#f1f3f4]"
                title="Undo last AI edit"
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

      {/* Primary actions */}
      <div className="flex items-center gap-2 pt-0.5 flex-wrap">
        <button
          type="button"
          onClick={onSend}
          disabled={empty || sendPending}
          className={cn(
            "px-3 py-1.5 text-[13px] font-medium text-white rounded-md transition-colors",
            "disabled:bg-[#dadce0] disabled:cursor-not-allowed",
            isSoft
              ? "bg-[#1a73e8] hover:bg-[#1765cc]"
              : "bg-[#c5221f] hover:bg-[#a50e0e]",
          )}
        >
          {sendPending ? "Sending..." : sendLabel}
        </button>
        <button
          type="button"
          onClick={onMarkResolved}
          disabled={resolve.isPending}
          className="px-3 py-1.5 text-[13px] text-[#5f6368] hover:bg-[#f1f3f4] rounded-md"
        >
          {resolve.isPending ? "Saving..." : "Mark resolved"}
        </button>
        {isSoft ? (
          <button
            type="button"
            onClick={onTakeover}
            disabled={takeover.isPending}
            className="ml-auto text-[12px] text-[#c5221f] hover:underline"
          >
            Switch to human takeover
          </button>
        ) : (
          <button
            type="button"
            onClick={onHandback}
            disabled={handback.isPending}
            className="ml-auto text-[12px] text-[#1a73e8] hover:underline"
          >
            Hand back to AI
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
