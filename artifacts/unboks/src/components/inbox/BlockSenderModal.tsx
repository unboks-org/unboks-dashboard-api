import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/error";
import { useBlockMutation } from "@/hooks/use-blocked-senders";
import { BLOCK_REASONS, type BlockReason } from "@/lib/api";
import { toast } from "sonner";
import type { Conversation } from "@/data/conversations";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface BlockSenderModalProps {
  open: boolean;
  conversation: Conversation | null;
  /** Operator label persisted on the backend record. We don't have a
   *  per-user identity in this dashboard yet, so the parent passes a
   *  static label (e.g. "Operator"). */
  operatorLabel: string;
  onClose: () => void;
  /** Called once the row has been successfully blocked, so the parent
   *  can clear the open detail pane and remove the row optimistically. */
  onBlocked?: (conversationId: string) => void;
}

/**
 * "Block this sender in Unboks?" confirm dialog (R2-30).
 *
 * Copy is verbatim from the brief so operators can never misread the
 * scope: this is dashboard-side suppression, NOT a channel-level block
 * (e.g. WhatsApp). Historical messages are never deleted; only future
 * inbound is suppressed.
 */
export function BlockSenderModal({
  open,
  conversation,
  operatorLabel,
  onClose,
  onBlocked,
}: BlockSenderModalProps) {
  const [reason, setReason] = useState<BlockReason>("spam");
  const [error, setError] = useState<string | null>(null);
  const block = useBlockMutation();

  // Reset reason + error whenever the dialog reopens or the target row
  // changes, so a previous "Other" pick doesn't carry over to a fresh
  // block flow on a different conversation.
  useEffect(() => {
    if (open) {
      setReason("spam");
      setError(null);
    }
  }, [open, conversation?.id]);

  const onConfirm = async () => {
    if (!conversation) return;
    setError(null);
    const conversationKey = conversation.conversationKey || conversation.id;
    if (!conversationKey) {
      setError("Couldn't block — no stable identifier on this row.");
      return;
    }
    try {
      await block.mutateAsync({
        conversationId: conversationKey,
        payload: { reason, blocked_by: operatorLabel || "Operator" },
      });
      toast.success("Blocked in Unboks", {
        description: "Future messages from this sender are suppressed in the active inbox.",
      });
      onBlocked?.(conversation.id);
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message || `Backend returned ${err.status}.`
          : err instanceof Error
            ? err.message
            : "Couldn't block. Please try again.";
      setError(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !block.isPending) onClose(); }}>
      <DialogContent className="box-border w-full sm:w-[calc(100vw-32px)] max-w-[460px] overflow-hidden rounded-t-[1.5rem] rounded-b-none sm:rounded-xl p-5 sm:p-6 mb-0 sm:mb-auto self-end sm:self-center mt-auto sm:mt-auto">
        <div className="absolute left-1/2 top-2 h-1 w-12 -translate-x-1/2 rounded-full bg-[#e8eaed] sm:hidden" aria-hidden="true" />
        <DialogHeader className="min-w-0">
          <DialogTitle className="break-words">Block this sender in Unboks?</DialogTitle>
          <DialogDescription className="sr-only">
            Block this sender from the active inbox.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-[13px] leading-relaxed text-[#3c4043]">
          <p>Future messages from this contact will not appear in the active inbox.</p>
          <p>Your Agent will not reply.</p>
          <p>Escalation alerts will not be triggered.</p>
          <p className="rounded-md border border-[#fde9c8] bg-[#fef7e0] px-3 py-2 text-[12px] text-[#7a4f00]">
            This does not block the contact inside WhatsApp itself. To stop messages on the phone too, block the number in WhatsApp.
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="block-sender-reason"
            className="block text-[12px] font-medium text-[#3c4043]"
          >
            Reason
          </label>
          <select
            id="block-sender-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as BlockReason)}
            disabled={block.isPending}
            className={cn(
              "block w-full rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-[13px] text-[#1f2937]",
              "focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30 focus:border-[#1a73e8]",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            )}
          >
            {BLOCK_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p role="alert" className="break-words text-[12px] text-[#c5221f]">
            {error}
          </p>
        )}

        <DialogFooter className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={block.isPending}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={block.isPending || !conversation}
            className="bg-[#c5221f] text-white hover:bg-[#a50e0e]"
          >
            {block.isPending ? "Blocking…" : "Block in Unboks"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
