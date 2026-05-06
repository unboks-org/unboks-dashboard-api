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
 * Both modes embed the AI Editor (Translate / Style / Fix) and remember the
 * previous draft so an Apply can be undone.
 *
 * If a send endpoint isn't connected (status 0 / 404 / 501 / 503), the
 * composer shows the calm fallback copy specified by product:
 *
 *   Soft: "Saved. Marina connection will be completed by the Unboks team."
 *   Hard: "Direct customer reply will be connected by the Unboks team."
 *
 * Strict copy rule: no em dashes anywhere in this file's user-facing text.
 */

import { useState } from "react";
import { Sparkles, VolumeX, User, Bot, Undo2 } from "lucide-react";
import { useEscalationMutations } from "@/hooks/use-client-api";
import { ApiError } from "@/lib/error";
import type { Channel } from "@/data/conversations";
import { cn } from "@/lib/utils";
import { AIEditorPanel } from "./AIEditorPanel";

const NOT_CONNECTED_STATUSES = new Set([0, 404, 501, 503]);

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

export function EscalationReplyComposer({
  conversationDbId,
  conversationId,
  mode,
  channel,
  aiMuted = false,
  onDone,
}: EscalationReplyComposerProps) {
  const [draft, setDraft] = useState("");
  const [prevDraft, setPrevDraft] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "info" | "warning" | "error";
    text: string;
  } | null>(null);

  const { guidance, reply, resolve, takeover, handback } = useEscalationMutations();
  const isSoft = mode === "soft";
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
    resolve.mutate(
      {
        id: conversationDbId,
        payload: isSoft
          ? {}
          : { resolutionNote: draft.trim() || undefined },
      },
      { onSuccess: onDone },
    );
  };

  const headingText = isSoft ? "Reply to Marina" : "Reply to customer";
  const helperText = isSoft
    ? "Marina will use your guidance to answer the customer."
    : "This reply will be sent directly to the customer.";
  const placeholder = isSoft
    ? "Write guidance for Marina..."
    : "Write your reply...";
  const sendLabel = isSoft ? "Send to Marina" : "Reply to customer";

  return (
    <div className="border-t border-[#e8eaed] bg-white px-4 py-3 space-y-2.5 flex-shrink-0">
      {/* Mode header */}
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium",
            isSoft
              ? "bg-[#fef7e0] text-[#5f3e00] border border-[#feefc3]"
              : "bg-[#fce8e6] text-[#5f1414] border border-[#f6c6c2]",
          )}
        >
          {isSoft ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
          {isSoft ? "Soft escalation" : "Hard escalation"}
        </div>
        {!isSoft && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#f1f3f4] text-[11px] text-[#5f6368]">
            <VolumeX className="w-3 h-3" />
            {aiMuted ? "AI muted" : "Human takeover"}
          </span>
        )}
      </div>

      <div>
        <p className="text-[13px] font-semibold text-[#202124]">{headingText}</p>
        <p className="text-[11px] text-[#5f6368] mt-0.5">{helperText}</p>
      </div>

      {/* Composer */}
      <div className="relative">
        <textarea
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
            onClick={() =>
              takeover.mutate({ id: conversationDbId }, { onSuccess: onDone })
            }
            disabled={takeover.isPending}
            className="ml-auto text-[12px] text-[#c5221f] hover:underline"
          >
            Switch to human takeover
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              handback.mutate({ id: conversationDbId }, { onSuccess: onDone })
            }
            disabled={handback.isPending}
            className="ml-auto text-[12px] text-[#1a73e8] hover:underline"
          >
            Hand back to AI
          </button>
        )}
      </div>

      {/* AI Editor */}
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
    </div>
  );
}

function isNotConnected(err: unknown): boolean {
  if (err instanceof ApiError) return NOT_CONNECTED_STATUSES.has(err.status);
  // Network failure / no response — also treat as not connected.
  return !(err instanceof Error) || err.name === "TypeError" || err.message === "Failed to fetch";
}
