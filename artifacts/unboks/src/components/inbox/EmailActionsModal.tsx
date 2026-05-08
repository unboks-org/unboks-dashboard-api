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
import { ApiError } from "@/lib/error";
import { useEmailReply, useEmailForward, useEmailDelete } from "@/hooks/use-client-api";
import type { Conversation } from "@/data/conversations";

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
  const reply = useEmailReply();
  const subject = conversation?.subject?.trim() || conversation?.sender || "this email";
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset whenever the modal opens for a new conversation.
  useEffect(() => {
    if (open) {
      setBody("");
      setError(null);
      // focus after the dialog mounts
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }, [open, conversation?.id]);

  const canSend = body.trim().length > 0 && !reply.isPending && Boolean(conversation);

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
    <Dialog open={open} onOpenChange={(v) => { if (!v && !reply.isPending) onClose(); }}>
      <DialogContent className="box-border w-[calc(100vw-32px)] max-w-[520px] overflow-hidden">
        <DialogHeader className="min-w-0">
          <DialogTitle className="break-words">Reply to email</DialogTitle>
          <DialogDescription
            className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
            title={subject}
          >
            {subject}
          </DialogDescription>
        </DialogHeader>
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
  onDeleted?: (conversationId: string) => void;
}

export function EmailDeleteConfirm({ open, conversation, onClose, onDeleted }: EmailDeleteConfirmProps) {
  const [error, setError] = useState<string | null>(null);
  const del = useEmailDelete();

  useEffect(() => {
    if (open) setError(null);
  }, [open, conversation?.id]);

  const onConfirm = async () => {
    if (!conversation) return;
    setError(null);
    try {
      await del.mutateAsync({
        conversationId: conversation.conversationKey || conversation.id,
        payload: { deleteMode: "trash" },
      });
      // Pass the display id back so the page can close the open detail
      // pane (which is keyed on `id`, not `conversationKey`).
      onDeleted?.(conversation.id);
      onClose();
    } catch (err) {
      setError(describeError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !del.isPending) onClose(); }}>
      <DialogContent className="box-border w-[calc(100vw-32px)] max-w-[420px] overflow-hidden">
        <DialogHeader className="min-w-0">
          <DialogTitle className="break-words">Delete this email conversation?</DialogTitle>
          <DialogDescription className="break-words">
            This will remove it from the inbox.
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
            {del.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
