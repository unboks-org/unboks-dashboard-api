import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { replyToWhatsAppConversation } from "@/lib/api";
import { useOperatorRequestId } from "@/hooks/use-operator-request-id";
import { directReplyCopy } from "@/lib/direct-whatsapp-reply";
import { ApiError } from "@/lib/error";
import { isSpainSpanishTenant } from "@/lib/tenant-ui";
import { cn } from "@/lib/utils";

interface ConversationReplyComposerProps {
  conversationId: string;
  onSent?: () => void | Promise<void>;
}

export function ConversationReplyComposer({
  conversationId,
  onSent,
}: ConversationReplyComposerProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const sendingRef = useRef(false);
  const requestIdentity = useOperatorRequestId();
  const [error, setError] = useState<string | null>(null);
  const hasMessage = draft.trim().length > 0;
  const copy = directReplyCopy();

  const send = async () => {
    if (!hasMessage || sendingRef.current) return;

    sendingRef.current = true;
    setIsSending(true);
    setError(null);
    try {
      const requestId = requestIdentity.forAttempt(conversationId, draft);
      const result = await replyToWhatsAppConversation(
        conversationId,
        draft,
        requestId,
      );
      requestIdentity.complete(requestId);
      setDraft("");
      if (result.delivery_mode === "template") {
        toast.success(copy.templateDelivered);
      } else {
        toast.success(copy.delivered);
      }
      try {
        await onSent?.();
      } catch {
        // Delivery already succeeded. The regular conversation poll will
        // refresh the timeline if this immediate refresh happens to fail.
      }
    } catch (err) {
      const message =
        isSpainSpanishTenant() && err instanceof ApiError && err.message
          ? err.message
          : err instanceof ApiError && err.status === 409
            ? copy.windowClosedError
            : copy.genericError;
      setError(message);
      toast.error(message);
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex-shrink-0 border-t border-[#e8eaed] bg-white px-3 py-3 sm:px-4"
      aria-label={copy.formLabel}
    >
      <div className="flex items-end gap-2 rounded-2xl border border-[#dfe3e8] bg-[#f8f9fa] p-2 shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
        <textarea
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={4096}
          disabled={isSending}
          placeholder={copy.placeholder}
          aria-label={copy.messageLabel}
          className="min-h-[40px] max-h-32 flex-1 resize-y bg-transparent px-2 py-2 text-[14px] leading-5 text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!hasMessage || isSending}
          className={cn(
            "inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors",
            "hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45",
          )}
          aria-label={isSending ? copy.sending : copy.send}
        >
          <Send className="h-4 w-4" strokeWidth={1.8} />
          <span className="hidden sm:inline">
            {isSending ? copy.sending : copy.send}
          </span>
        </button>
      </div>
      <div className="mt-1.5 flex min-h-4 items-center justify-between gap-3 px-1">
        <p
          className={cn(
            "text-[11.5px]",
            error ? "text-destructive" : "text-muted-foreground",
          )}
          role={error ? "alert" : undefined}
        >
          {error ?? copy.hint}
        </p>
        {draft.length >= 3800 && (
          <span className="text-[11px] text-muted-foreground">
            {draft.length}/4096
          </span>
        )}
      </div>
    </form>
  );
}
