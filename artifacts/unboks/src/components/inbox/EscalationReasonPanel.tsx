/**
 * EscalationReasonPanel — decision-first briefing at the top of an
 * escalation detail pane.
 *
 * Sourcing
 * ========
 * The four sections (reason / customer wants / Marina needs / options)
 * are built by `buildEscalationBriefing` from a combination of:
 *  - backend `summary` and `reason` fields (when present),
 *  - heuristic topic detection on the latest customer + assistant
 *    messages (meeting / pricing / complaint / channels / human / etc.),
 *  - the operator-selected mode (soft vs. hard).
 *
 * No customer-specific wording is ever invented — every concrete phrase
 * is either copied from a backend field or extracted from the actual
 * message text. The vague generic fallback is reserved for the case
 * where there is literally no data to read.
 *
 * Refero references
 * =================
 * Pattern triangulation across Intercom ticket detail summaries, Linear
 * issue detail action panels, Front shared inbox, Zendesk ticket panels:
 * compact card, small uppercase section labels, one-line answers, quiet
 * mode pill top-right, low-saturation chips at the bottom.
 *
 * Action chips
 * ============
 * Every chip is a real button with hover/focus states and keyboard
 * support. Clicking a chip dispatches one of three actions to the parent
 * via `onChipAction`:
 *
 *   - `{ kind: "draft", text }` — fill or append the operator composer
 *     with mode-appropriate wording (soft: guidance to Marina; hard:
 *     customer-facing reply). The composer never auto-sends.
 *   - `{ kind: "takeover" }` — switch to human takeover. The composer
 *     handles the existing mutation; mode flips to "hard".
 *   - `{ kind: "handback" }` — hand back to Marina (hard → soft).
 *   - `{ kind: "resolve" }` — same path as the visible "Mark resolved"
 *     button.
 *
 * The mapping from chip label to action lives in `chipToAction`. It
 * deliberately handles every chip the local heuristic produces and every
 * shape the backend `recommendedOptions` is likely to ship, with a safe
 * default of `{ kind: "draft", text: <focus only> }` so unknown chips
 * still feel responsive instead of silently doing nothing.
 */

import { Bot, MessageSquare, User, VolumeX } from "lucide-react";
import type { ApiMessage } from "@/lib/api";
import {
  buildEscalationBriefing,
} from "@/lib/escalation-summary";
import { cn } from "@/lib/utils";

export type ChipAction =
  | { kind: "draft"; text: string }
  | { kind: "focus" }
  | { kind: "takeover" }
  | { kind: "handback" }
  | { kind: "resolve" };

interface EscalationReasonPanelProps {
  mode: "soft" | "hard";
  summary?: string | null;
  reason?: string | null;
  aiMuted?: boolean;
  messages?: ApiMessage[];
  customerName?: string | null;
  /**
   * Backend-supplied recommended options. If present and non-empty,
   * EVERY entry is rendered as its own chip in order — no slicing.
   */
  recommendedOptions?: string[] | null;
  /**
   * Backend-supplied scheduling slots. Each entry becomes its own
   * "Confirm <time>" chip; multiple times are never collapsed into one.
   */
  proposedTimes?: string[] | null;
  /**
   * Dispatched when a chip is clicked. Inbox forwards this to the
   * EscalationReplyComposer's imperative handle.
   */
  onChipAction?: (action: ChipAction) => void;
}

export function EscalationReasonPanel({
  mode,
  summary,
  reason,
  aiMuted = false,
  messages,
  customerName,
  recommendedOptions,
  proposedTimes,
  onChipAction,
}: EscalationReasonPanelProps) {
  const isSoft = mode === "soft";
  const briefing = buildEscalationBriefing({
    mode,
    summary,
    reason,
    messages,
    customerName,
    recommendedOptions,
    proposedTimes,
  });

  // First proposed slot from the backend (if any) is used to make the
  // "Suggest another time" / availability drafts more specific. We fall
  // back to scanning the briefing options for the first "Confirm <X>"
  // chip when the backend didn't ship structured proposedTimes.
  const firstSlot = pickFirstSlot(proposedTimes, briefing.options);
  const firstName = pickFirstName(customerName);

  const handleChip = (label: string) => {
    if (!onChipAction) return;
    onChipAction(chipToAction(label, mode, firstName, firstSlot));
  };

  return (
    <section
      aria-label="Escalation reason"
      className="border-b border-[#e8eaed] bg-white px-4 py-3 flex-shrink-0"
    >
      <div className="rounded-lg border border-[#e8eaed] bg-[#fbfbfd] px-4 py-3">
        {/* Title row + mode pill. Pill stays low-saturation so it reads as
            status rather than alarm. */}
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <MessageSquare className="h-3.5 w-3.5 text-[#5f6368] flex-shrink-0" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#5f6368]">
              Escalation reason
            </h2>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium",
                isSoft
                  ? "border-[#feefc3] bg-[#fef7e0] text-[#5f3e00]"
                  : "border-[#f6c6c2] bg-[#fce8e6] text-[#5f1414]",
              )}
            >
              {isSoft ? (
                <Bot className="h-2.5 w-2.5" />
              ) : (
                <User className="h-2.5 w-2.5" />
              )}
              {isSoft ? "AI needs help" : "Human takeover"}
            </span>
            {!isSoft && aiMuted && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-[#f1f3f4] px-1.5 py-0.5 text-[10.5px] text-[#5f6368]"
                title="Marina will not auto-reply while in human takeover."
              >
                <VolumeX className="h-2.5 w-2.5" />
                AI muted
              </span>
            )}
          </div>
        </div>

        {/* Reason — the specific, briefing-style "why am I looking at this?" */}
        <p className="text-[13px] leading-[1.5] text-[#202124]">
          {briefing.reason}
        </p>

        {/* Two-up grid: customer side / operator side. */}
        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9aa0a6]">
              {isSoft ? "Customer wants" : "Customer needs"}
            </dt>
            <dd className="mt-0.5 text-[12.5px] leading-[1.5] text-[#202124]">
              {briefing.customerWants}
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9aa0a6]">
              {isSoft ? "Marina needs" : "Operator needs to decide"}
            </dt>
            <dd className="mt-0.5 text-[12.5px] leading-[1.5] text-[#202124]">
              {briefing.marinaNeeds}
            </dd>
          </div>
        </dl>

        {/* Options chips — real buttons. Each click dispatches a
            structured action up to Inbox, which routes it through the
            composer's imperative handle. Visual is intentionally quiet:
            white background, hairline border, low-contrast text, with a
            premium hover that slightly darkens the surface. */}
        <div className="mt-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9aa0a6]">
            Options
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {briefing.options.map((opt, i) => (
              <li key={`${opt}-${i}`}>
                <button
                  type="button"
                  onClick={() => handleChip(opt)}
                  title={chipTooltip(opt, mode)}
                  className={cn(
                    "inline-flex items-center rounded-full border bg-white px-2.5 py-0.5 text-[11.5px] text-[#3c4043]",
                    "border-[#dadce0] cursor-pointer transition-colors",
                    "hover:bg-[#f1f3f4] hover:text-[#202124]",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1",
                    "active:bg-[#e8eaed]",
                  )}
                >
                  {opt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Chip → action mapping
// ---------------------------------------------------------------------------
//
// Pattern-based so it tolerates the slight variations the backend ships
// vs. what the local heuristic produces ("Ask Marina to collect more
// availability" vs. "Ask for more availability", etc.). Every branch
// returns either a structured action (takeover/handback/resolve) or a
// `draft` action with mode-appropriate wording. Unknown chips fall
// through to a no-op `focus` action so the composer at least gets focus
// instead of the click feeling broken.

const CONFIRM_RE = /^confirm\s+(.+)$/i;

function chipToAction(
  label: string,
  mode: "soft" | "hard",
  firstName: string,
  firstSlot: string | null,
): ChipAction {
  const normalized = label.trim();
  const lower = normalized.toLowerCase();

  // --- Pure actions (mode-changing / lifecycle) ----------------------------
  if (/switch to human takeover/i.test(normalized)) return { kind: "takeover" };
  if (/hand back to (marina|ai)/i.test(normalized)) return { kind: "handback" };
  if (/^mark resolved$/i.test(normalized)) return { kind: "resolve" };

  // --- "Confirm <slot>" ----------------------------------------------------
  const confirmMatch = normalized.match(CONFIRM_RE);
  if (confirmMatch) {
    const slot = confirmMatch[1].trim();
    if (mode === "soft") {
      return {
        kind: "draft",
        text: `Please confirm ${slot} with ${firstName}.`,
      };
    }
    return {
      kind: "draft",
      text: `${slot} works for us. We'll confirm the activation meeting for that time.`,
    };
  }

  // --- "Suggest another time" ---------------------------------------------
  if (/suggest another time/i.test(normalized)) {
    if (mode === "soft") {
      const ref = firstSlot ? `that ${firstSlot}` : "the suggested time";
      return {
        kind: "draft",
        text: `Please let ${firstName} know that ${ref} does not work and ask for another time.`,
      };
    }
    const ref = firstSlot ? `${firstSlot} does not work for us.` : "That time does not work for us.";
    return {
      kind: "draft",
      text: `${ref} Could you send 2 or 3 other times that work for you this week?`,
    };
  }

  // --- Availability requests ----------------------------------------------
  if (
    /ask (marina to collect more availability|for more availability|marina to collect availability|for availability)/i.test(
      normalized,
    )
  ) {
    if (mode === "soft") {
      return {
        kind: "draft",
        text: `Please ask ${firstName} to send 2 or 3 other times that work for him this week.`,
      };
    }
    return {
      kind: "draft",
      text:
        "Could you send 2 or 3 times that work for you this week? Then we can confirm the activation call.",
    };
  }

  // --- Hard-mode reply scaffolds ------------------------------------------
  if (mode === "hard") {
    if (/^reply with a time$/i.test(normalized)) {
      return {
        kind: "draft",
        text:
          "Could you send 2 or 3 times that work for you this week? Then we can confirm the meeting.",
      };
    }
    if (/^reply with pricing$/i.test(normalized)) {
      return {
        kind: "draft",
        text:
          "Happy to share pricing. Could you tell me a little more about what you need so I can quote accurately?",
      };
    }
    if (/^reply with a resolution$/i.test(normalized)) {
      return {
        kind: "draft",
        text:
          "Thanks for flagging this. Here's how we'll resolve it: ",
      };
    }
    if (/^reply with booking details$/i.test(normalized)) {
      return {
        kind: "draft",
        text:
          "Happy to help with the booking. Could you confirm the date, time, and any details we should know?",
      };
    }
    if (/^ask (for more details|for more information|what they need first|for missing information)$/i.test(normalized)) {
      return {
        kind: "draft",
        text:
          "Could you share a few more details so I can help properly?",
      };
    }
    if (/^reply directly to customer$/i.test(normalized)) {
      return { kind: "focus" };
    }
  }

  // --- Soft-mode guidance scaffolds ---------------------------------------
  if (mode === "soft") {
    if (/^tell marina to confirm a time$/i.test(normalized)) {
      const ref = firstSlot ? firstSlot : "the time the customer suggested";
      return {
        kind: "draft",
        text: `Please confirm ${ref} with ${firstName}.`,
      };
    }
    if (/^tell marina what to quote$/i.test(normalized)) {
      return {
        kind: "draft",
        text: `Please share these prices with ${firstName}: `,
      };
    }
    if (/^tell marina how to acknowledge$/i.test(normalized)) {
      return {
        kind: "draft",
        text: `Please acknowledge ${firstName}'s issue and let them know we're looking into it.`,
      };
    }
    if (/^tell marina how to handle the booking$/i.test(normalized)) {
      return {
        kind: "draft",
        text: `Please help ${firstName} with the booking. Confirm the details and let them know next steps.`,
      };
    }
    if (/^tell marina to set expectations$/i.test(normalized)) {
      return {
        kind: "draft",
        text: `Please let ${firstName} know that a human will follow up shortly.`,
      };
    }
    if (/^tell marina what to answer$/i.test(normalized)) {
      return { kind: "focus" };
    }
    if (/^ask marina to (collect details|collect requirements first|request more details|request missing details|collect more availability)$/i.test(lower)) {
      return {
        kind: "draft",
        text: `Please ask ${firstName} for more details so we can help properly.`,
      };
    }
  }

  // --- Default: no draft change, just focus the composer ------------------
  return { kind: "focus" };
}

function chipTooltip(label: string, mode: "soft" | "hard"): string {
  if (/switch to human takeover/i.test(label)) {
    return "Switch this conversation to human takeover.";
  }
  if (/hand back to (marina|ai)/i.test(label)) {
    return "Hand the conversation back to Marina.";
  }
  if (/^mark resolved$/i.test(label)) {
    return "Mark this escalation as resolved.";
  }
  return mode === "soft"
    ? "Insert this guidance for Marina."
    : "Insert this reply for the customer.";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickFirstName(name?: string | null): string {
  if (!name) return "the customer";
  const n = name.trim();
  if (!n || n.toLowerCase() === "unknown contact") return "the customer";
  const first = n.split(/\s+/)[0].replace(/[^\p{L}\p{N}'-]/gu, "");
  return first || "the customer";
}

function pickFirstSlot(
  proposedTimes: string[] | null | undefined,
  options: string[],
): string | null {
  if (Array.isArray(proposedTimes)) {
    const first = proposedTimes.find(
      (t): t is string => typeof t === "string" && t.trim().length > 0,
    );
    if (first) return first.trim();
  }
  for (const o of options) {
    const m = o.match(CONFIRM_RE);
    if (m) return m[1].trim();
  }
  return null;
}
