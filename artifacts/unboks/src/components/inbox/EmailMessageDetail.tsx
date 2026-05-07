import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";
import type { ApiMessage } from "@/lib/api";
import { parseEmail, tokenizeInline } from "@/lib/email-parser";
import { cn } from "@/lib/utils";
import { MessageTranslationView } from "@/components/inbox/ConversationTranslation";

// ---------------------------------------------------------------------------
// EmailMessageDetail
// ---------------------------------------------------------------------------
//
// Premium email-style card for a single message in the conversation thread.
// Replaces the plain chat bubble that was rendering raw blob text. Inspired
// by Gmail / Front / Superhuman: clean prose body, muted signature block,
// collapsed legal/confidentiality footer.

function InlineText({ value }: { value: string }) {
  // Render *bold* spans without dangerouslySetInnerHTML. Whitespace including
  // newlines is preserved by the surrounding `whitespace-pre-wrap` container.
  const tokens = tokenizeInline(value);
  if (tokens.length === 0) return <>{value}</>;
  return (
    <>
      {tokens.map((t, i) =>
        t.kind === "bold" ? (
          <strong key={i} className="font-semibold text-[#202124]">
            {t.value}
          </strong>
        ) : (
          <Fragment key={i}>{t.value}</Fragment>
        ),
      )}
    </>
  );
}

interface EmailMessageDetailProps {
  msg: ApiMessage;
}

export function EmailMessageDetail({ msg }: EmailMessageDetailProps) {
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const { body, signature, disclaimer } = parseEmail(msg.content);
  const isAssistant = msg.role === "assistant";

  // The body can still be empty in the pathological case where the parser
  // pulled everything into signature/disclaimer. Always render *something*
  // so the card is never blank.
  const displayBody = body || msg.content;

  return (
    <article
      className={cn(
        "rounded-xl border bg-white px-5 py-4 shadow-[0_1px_2px_rgba(60,64,67,0.06)]",
        isAssistant ? "border-[#d2e3fc] bg-[#f6faff]" : "border-[#e8eaed]",
      )}
    >
      {/* Subtle role label so threaded views still tell sender vs. our reply
          apart, without resorting to chat-bubble alignment. */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <span
          className={cn(
            "text-[11px] font-medium uppercase tracking-wide",
            isAssistant ? "text-[#1a73e8]" : "text-[#5f6368]",
          )}
        >
          {isAssistant ? "Sent" : "Received"}
        </span>
        {msg.timestamp && (
          <span className="text-[11px] text-[#9aa0a6]">{msg.timestamp}</span>
        )}
      </div>

      {/* Main body. `whitespace-pre-wrap` preserves the line breaks the
          parser left in place; `break-words` keeps long URLs from blowing
          out the column. */}
      <div className="text-[14px] leading-[1.55] text-[#202124] whitespace-pre-wrap break-words">
        <InlineText value={displayBody} />
      </div>

      {signature && (
        <div className="mt-4 border-t border-[#f1f3f4] pt-3 text-[12px] leading-[1.5] text-[#5f6368] whitespace-pre-wrap break-words">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[#9aa0a6]">
            Signature
          </p>
          <InlineText value={signature} />
        </div>
      )}

      {msg.id && <MessageTranslationView messageId={msg.id} align="card" />}

      {disclaimer && (
        <div className="mt-3 rounded-lg bg-[#f8f9fa] px-3 py-2">
          <button
            type="button"
            onClick={() => setShowDisclaimer((v) => !v)}
            aria-expanded={showDisclaimer}
            className="flex w-full items-center gap-2 text-left text-[12px] font-medium text-[#5f6368] hover:text-[#202124]"
          >
            {showDisclaimer ? (
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
            )}
            <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0 text-[#9aa0a6]" />
            <span>Confidentiality notice</span>
            <span className="ml-auto text-[11px] font-normal text-[#9aa0a6]">
              {showDisclaimer ? "Hide" : "Show"}
            </span>
          </button>
          {showDisclaimer && (
            <p className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-[1.5] text-[#80868b]">
              <InlineText value={disclaimer} />
            </p>
          )}
        </div>
      )}
    </article>
  );
}
