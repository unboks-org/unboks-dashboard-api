/**
 * EscalationReasonPanel — decision-first summary at the top of an
 * escalation detail pane.
 *
 * Why this exists
 * ===============
 * The previous escalation pane was conversation-first: the operator
 * landed on the full message thread and had to read it before they could
 * decide what to do. That is the wrong default for escalation handling.
 *
 * This panel surfaces the four things an operator actually needs first:
 *  1. Why this escalation exists (summary)
 *  2. What the customer wants
 *  3. What Marina (soft) or the operator (hard) needs to decide
 *  4. A short list of operator options
 *
 * Refero references (loaded via mcpRefero_referoSearchScreens):
 *   - Intercom ticket detail summary panel — top result for
 *     "ticket detail summary panel reason action chips support
 *     escalation Linear Intercom Zendesk".
 *   Pattern triangulation across Intercom / Linear / Front / Zendesk
 *   ticket panels: a compact card with small uppercase section labels,
 *   one-line answers, a quiet mode pill at the top right, and a row of
 *   low-saturation chips at the bottom. No loud banner, no raw dump.
 *
 * Data
 * ====
 *  - `summary`  → `detail.escalationSummary` (string | null)
 *  - `reason`   → `detail.escalationReason`  (string | null)
 *  - `aiMuted`  → `detail.aiMuted` (annotates the hard-mode pill only)
 *
 * If the structured fields aren't populated by the backend, we fall back
 * to safe generic copy described in the spec. We never invent
 * customer-specific wording.
 *
 * Action chips
 * ============
 * Visual only for v1. The actual operator actions (Send to Marina,
 * Switch to human takeover, Hand back to Marina, Mark resolved) are
 * already wired in the composer rendered immediately below this panel,
 * so the chips function as a reminder of available paths rather than
 * duplicate buttons. Spec explicitly allows this.
 */

import { Bot, MessageSquare, User, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface EscalationReasonPanelProps {
  mode: "soft" | "hard";
  summary?: string | null;
  reason?: string | null;
  aiMuted?: boolean;
}

const SOFT_OPTIONS = [
  "Tell Marina what to answer",
  "Ask Marina to request more details",
  "Switch to human takeover",
  "Mark resolved",
];

const HARD_OPTIONS = [
  "Reply directly to customer",
  "Ask for more information",
  "Hand back to Marina",
  "Mark resolved",
];

export function EscalationReasonPanel({
  mode,
  summary,
  reason,
  aiMuted = false,
}: EscalationReasonPanelProps) {
  const isSoft = mode === "soft";

  const trimmedSummary = summary?.trim() ?? "";
  const trimmedReason = reason?.trim() ?? "";

  // Safe fallback copy when the backend doesn't ship a structured
  // summary. Spec wording, not invented.
  const summaryText =
    trimmedSummary.length > 0
      ? trimmedSummary
      : isSoft
        ? "Marina needs human guidance before replying to this customer."
        : "This conversation is in human takeover mode.";

  const customerLine = isSoft
    ? "Review the customer's request, then guide Marina on how to respond."
    : "Customer is waiting for a direct human reply.";

  const decisionLine = isSoft
    ? "Choose how Marina should respond, or ask Marina to collect more details."
    : "Send a direct reply, request more information, or hand back to Marina.";

  const options = isSoft ? SOFT_OPTIONS : HARD_OPTIONS;

  // Show the AI-provided "why" only if it adds new information beyond
  // the summary line. Avoids the same sentence appearing twice.
  const showReason =
    trimmedReason.length > 0 && trimmedReason !== trimmedSummary;

  return (
    <section
      aria-label="Escalation reason"
      className="border-b border-[#e8eaed] bg-white px-4 py-3 flex-shrink-0"
    >
      <div className="rounded-lg border border-[#e8eaed] bg-[#fbfbfd] px-4 py-3">
        {/* Title row + mode pill. Pill is intentionally low-saturation
            (soft = warm cream, hard = soft red) so it reads as status
            rather than alarm. */}
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

        {/* Summary — the one-line answer to "why am I looking at this?" */}
        <p className="text-[13px] leading-[1.5] text-[#202124]">
          {summaryText}
        </p>

        {/* AI-provided reason, only when distinct from the summary. */}
        {showReason && (
          <p className="mt-1 text-[12px] leading-[1.5] text-[#5f6368]">
            <span className="font-semibold text-[#5f6368]">Why: </span>
            {trimmedReason}
          </p>
        )}

        {/* Two-up grid: customer side / operator side. Single column on
            mobile so neither line gets squeezed. */}
        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9aa0a6]">
              {isSoft ? "Customer wants" : "Customer needs"}
            </dt>
            <dd className="mt-0.5 text-[12.5px] leading-[1.5] text-[#202124]">
              {customerLine}
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9aa0a6]">
              {isSoft ? "Marina needs" : "Operator needs to decide"}
            </dt>
            <dd className="mt-0.5 text-[12.5px] leading-[1.5] text-[#202124]">
              {decisionLine}
            </dd>
          </div>
        </dl>

        {/* Options chips. Visual only — the actions themselves are wired
            in the composer below this panel (Send / Switch / Hand back /
            Mark resolved). */}
        <div className="mt-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9aa0a6]">
            Options
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {options.map((opt) => (
              <li
                key={opt}
                className="inline-flex items-center rounded-full border border-[#dadce0] bg-white px-2.5 py-0.5 text-[11.5px] text-[#5f6368]"
              >
                {opt}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
