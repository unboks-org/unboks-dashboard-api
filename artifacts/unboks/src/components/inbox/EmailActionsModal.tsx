import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import { ApiError } from "@/lib/error";
import { useEmailReply, useEmailForward, useEmailDelete } from "@/hooks/use-client-api";
import {
  useHiddenConversations,
  collectConversationHideKeys,
} from "@/hooks/use-hidden-conversations";
import { toast } from "sonner";
import type { Conversation } from "@/data/conversations";
import { cn } from "@/lib/utils";
import { AIEditorPanel } from "@/components/inbox/AIEditorPanel";
import { motion } from "framer-motion";

/**
 * Translate any error from the email mutation hooks into calm operator copy.
 *
 * Per the bugfix brief: do NOT show a placeholder unless the backend
 * returns 404 or 501. Every other error path shows the backend message
 * verbatim so operators see the real failure reason instead of canned
 * copy hiding it.
 *
 * - 404 / 501 → "endpoint not deployed yet" placeholder (the only case).
 * - 0 (network) / 503 / 401 / 403 / 400 / 409 / 500 / anything else
 *   → show `err.message` (the backend body or fetch failure text);
 *   fall back to a `Request failed (status).` line only if the message
 *   is genuinely empty.
 */
function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404 || err.status === 501) {
      return "This email action is not available yet.";
    }
    if (err.message && err.message.trim().length > 0) return err.message;
    if (err.status === 0) {
      return "Couldn't reach the server. Check your connection and try again.";
    }
    return `Request failed (${err.status}).`;
  }
  if (err instanceof Error && err.message.trim().length > 0) return err.message;
  return "Unknown error.";
}

// ---------------------------------------------------------------------------
// Reply
// ---------------------------------------------------------------------------

interface EmailReplyModalProps {
  open: boolean;
  conversation: Conversation | null;
  onClose: () => void;
}

export function EmailReplyModal({ open, conversation, onClose }: EmailReplyModalProps) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const reply = useEmailReply();
  const subject = conversation?.subject?.trim() || conversation?.sender || "this email";
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset whenever the modal opens for a new conversation.
  useEffect(() => {
    if (open) {
      setBody("");
      setError(null);
      setAiOpen(false);
      // focus after the dialog mounts
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }, [open, conversation?.id]);

  const canSend = body.trim().length > 0 && !reply.isPending && Boolean(conversation);
  const hasBody = body.trim().length > 0;

  const onSend = async () => {
    if (!conversation) return;
    setError(null);
    try {
      await reply.mutateAsync({
        conversationId: conversation.conversationKey || conversation.id,
        payload: { body: body.trim(), mode: "direct", attachments: [] },
      });
      onClose();
    } catch (err) {
      setError(describeError(err));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) return;
        if (reply.isPending) return;
        // When the Agent Editor is open, Esc / outside-click should
        // return the operator to the composer, not close the whole
        // email reply modal (and lose the draft).
        if (aiOpen) {
          setAiOpen(false);
          return;
        }
        onClose();
      }}
    >
      <DialogContent
        className={cn(
          "box-border w-full sm:w-[calc(100vw-32px)] max-w-[520px] overflow-hidden rounded-t-[1.5rem] rounded-b-none sm:rounded-xl transition-all duration-300 ease-out p-5 sm:p-6 mb-0 sm:mb-auto self-end sm:self-center mt-auto sm:mt-auto",
          aiOpen && "flex flex-col max-h-[85vh] p-0 gap-0 [&>button]:hidden",
        )}
      >
        <div className="absolute left-1/2 top-2 h-1 w-12 -translate-x-1/2 rounded-full bg-[#e8eaed] sm:hidden" aria-hidden="true" />
        {aiOpen ? (
          // Render Agent Editor INSIDE this dialog (no nested modal, no
          // portal, no second focus trap). The host dialog already handles
          // overlay, escape, and accessibility. The sr-only DialogTitle
          // satisfies Radix's a11y requirement while the inline panel
          // shows its own visible "Agent Editor" header.
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>Agent Editor</DialogTitle>
            </DialogHeader>
            <AIEditorPanel
              inline
            open={aiOpen}
            onClose={() => setAiOpen(false)}
            draftText={body}
            onApply={(text) => setBody(text)}
              context={{
                conversationId: conversation?.conversationKey || conversation?.id,
                channel: "email",
              }}
            />
          </>
        ) : (
          <>
            <DialogHeader className="min-w-0">
              <DialogTitle className="break-words">Reply to email</DialogTitle>
              <DialogDescription
                className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                title={subject}
              >
                {subject}
              </DialogDescription>
            </DialogHeader>

            {/* Identity notice — operator must know this goes out as the team, not as the Agent */}
            <div className="flex items-center gap-2 rounded-md border border-[#e6e8eb] bg-[#fbfbfd] px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-[#7a8fa6] flex-shrink-0" />
              <span className="text-[12px] text-[#5f6368]">
                Sent as your team, not as the Agent
              </span>
            </div>

            <div className="min-w-0 space-y-2">
              <Label htmlFor="email-reply-body" className="sr-only">Reply</Label>
              <Textarea
                id="email-reply-body"
                ref={taRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your reply…"
                className="box-border block min-h-[140px] w-full max-w-full min-w-0 resize-none text-[14px]"
                disabled={reply.isPending}
              />
              {/* Agent Editor trigger — active only when there is draft text */}
              <button
                type="button"
                onClick={() => setAiOpen(true)}
                disabled={!hasBody || reply.isPending}
                aria-label="Open Agent Editor"
                title="Agent Editor: Translate, Style, Fix"
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors",
                  !hasBody || reply.isPending
                    ? "border-[#e8eaed] text-[#9aa0a6] bg-white cursor-not-allowed"
                    : "border-[#1a73e8]/30 text-[#1a73e8] bg-[#f0f6ff] hover:bg-[#e8f0fe]",
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Agent Editor
              </button>
              {error && (
                <p role="alert" className="break-words text-[12px] text-[#c5221f]">{error}</p>
              )}
            </div>
            <DialogFooter className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={reply.isPending}>Cancel</Button>
              <Button onClick={onSend} disabled={!canSend}>
                {reply.isPending ? "Sending…" : "Send reply"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Forward
// ---------------------------------------------------------------------------

interface EmailForwardModalProps {
  open: boolean;
  conversation: Conversation | null;
  onClose: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailForwardModal({ open, conversation, onClose }: EmailForwardModalProps) {
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const forward = useEmailForward();
  const subject = conversation?.subject?.trim() || conversation?.sender || "this email";

  useEffect(() => {
    if (open) {
      setTo("");
      setNote("");
      setError(null);
    }
  }, [open, conversation?.id]);

  const recipients = useMemo(
    () => to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean),
    [to],
  );
  const allValid = recipients.length > 0 && recipients.every((r) => EMAIL_RE.test(r));
  const canSend = allValid && !forward.isPending && Boolean(conversation);

  const onSend = async () => {
    if (!conversation) return;
    setError(null);
    if (!allValid) {
      setError("Enter at least one valid email address.");
      return;
    }
    try {
      await forward.mutateAsync({
        conversationId: conversation.conversationKey || conversation.id,
        payload: { to: recipients, note: note.trim() || undefined, includeAttachments: true },
      });
      onClose();
    } catch (err) {
      setError(describeError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !forward.isPending) onClose(); }}>
      <DialogContent className="box-border w-[calc(100vw-32px)] max-w-[520px] overflow-hidden">
        <DialogHeader className="min-w-0">
          <DialogTitle className="break-words">Forward email</DialogTitle>
          <DialogDescription
            className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
            title={subject}
          >
            {subject}
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="email-forward-to" className="text-[12px] font-medium text-[#5f6368]">
              To
            </Label>
            <Input
              id="email-forward-to"
              type="email"
              autoComplete="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              disabled={forward.isPending}
              className="box-border block w-full max-w-full min-w-0"
            />
            <p className="text-[11px] text-[#9aa0a6]">
              Separate multiple addresses with commas.
            </p>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="email-forward-note" className="text-[12px] font-medium text-[#5f6368]">
              Note <span className="text-[#9aa0a6] font-normal">(optional)</span>
            </Label>
            <Textarea
              id="email-forward-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a short note for the recipient…"
              className="box-border block min-h-[88px] w-full max-w-full min-w-0 resize-none text-[14px]"
              disabled={forward.isPending}
            />
          </div>
          {error && (
            <p role="alert" className="break-words text-[12px] text-[#c5221f]">{error}</p>
          )}
        </div>
        <DialogFooter className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={forward.isPending}>Cancel</Button>
          <Button onClick={onSend} disabled={!canSend}>
            {forward.isPending ? "Forwarding…" : "Forward"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete (confirm)
// ---------------------------------------------------------------------------

interface EmailDeleteConfirmProps {
  open: boolean;
  conversation: Conversation | null;
  onClose: () => void;
  /** Called once the row has been removed (backend success OR local
   *  hide fallback). Used by the page to close the detail pane if it
   *  was open on this row. */
  onDeleted?: (conversationId: string) => void;
}

/**
 * "Remove this conversation?" confirm dialog (per Brief 213).
 *
 * Behaviour matrix:
 *
 *   Backend success                → react-query invalidates the list,
 *                                    we also persist the row's keys to
 *                                    the local hidden set so a stale
 *                                    backend (or escalation re-emit)
 *                                    can never bring the row back in
 *                                    this browser. No toast (silent
 *                                    success — the row just disappears).
 *   ApiError 404 / 405 / 501       → backend delete not deployed for
 *                                    this row. Persist the keys to the
 *                                    local hidden set and show a calm
 *                                    notice. Treated as success from
 *                                    the operator's point of view.
 *   Any other error (0/4xx/5xx)    → show the backend message
 *                                    verbatim (`describeError`). Do
 *                                    NOT pretend the row was removed.
 *
 * The hide keys are collected from the row's `conversationKey`, `id`
 * and `escalationId` (escalation rows have all three). Display names
 * are never used as keys.
 */
export function EmailDeleteConfirm({ open, conversation, onClose, onDeleted }: EmailDeleteConfirmProps) {
  const [error, setError] = useState<string | null>(null);
  const del = useEmailDelete();
  const { hide } = useHiddenConversations();

  useEffect(() => {
    if (open) setError(null);
  }, [open, conversation?.id]);

  const finishHidden = (keys: string[]) => {
    if (keys.length > 0) hide(keys);
    // Always pass the display id so the page can close an open detail
    // pane keyed on `id`.
    if (conversation) onDeleted?.(conversation.id);
    onClose();
  };

  const onConfirm = async () => {
    if (!conversation) return;
    setError(null);
    const keys = collectConversationHideKeys(conversation);
    try {
      await del.mutateAsync({
        conversationId: conversation.conversationKey || conversation.id,
        payload: { deleteMode: "trash" },
      });
      finishHidden(keys);
    } catch (err) {
      // Local-hide fallback path: backend really doesn't have the
      // delete endpoint deployed for this row (or the row's id isn't
      // routable, e.g. a synthesized `esc:<id>`). Treat as success
      // for the operator and tell them honestly.
      if (
        err instanceof ApiError &&
        (err.status === 404 || err.status === 405 || err.status === 501)
      ) {
        finishHidden(keys);
        toast(
          "Hidden locally. Backend delete is not connected for this row yet.",
        );
        return;
      }
      // Anything else: show the real error, don't fake removal.
      setError(describeError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !del.isPending) onClose(); }}>
      <DialogContent className="box-border w-[calc(100vw-32px)] max-w-[420px] overflow-hidden">
        <DialogHeader className="min-w-0">
          <DialogTitle className="break-words">Remove this conversation?</DialogTitle>
          <DialogDescription className="break-words">
            This will hide it from the active inbox and escalation list.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="break-words text-[12px] text-[#c5221f]">{error}</p>
        )}
        <DialogFooter className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={del.isPending}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={del.isPending}
            className="bg-[#c5221f] text-white hover:bg-[#a50e0e]"
          >
            {del.isPending ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
