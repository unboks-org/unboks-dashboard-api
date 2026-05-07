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
 * mode pill top-right, low-saturation chips at the bottom. (Refero query
 * confirmed connectivity in the previous loop; not re-queried this loop
 * since the panel layout is unchanged — only the content source.)
 *
 * Action chips
 * ============
 * Visual only for v1. The actual operator actions (Send to Marina /
 * customer, Switch to human takeover, Hand back to Marina, Mark
 * resolved) are wired in the composer rendered immediately below.
 */

import { Bot, MessageSquare, User, VolumeX } from "lucide-react";
import type { ApiMessage } from "@/lib/api";
import {
  buildEscalationBriefing,
} from "@/lib/escalation-summary";
import { cn } from "@/lib/utils";

interface EscalationReasonPanelProps {
  mode: "soft" | "hard";
  summary?: string | null;
  reason?: string | null;
  aiMuted?: boolean;
  messages?: ApiMessage[];
  customerName?: string | null;
}

export function EscalationReasonPanel({
  mode,
  summary,
  reason,
  aiMuted = false,
  messages,
  customerName,
}: EscalationReasonPanelProps) {
  const isSoft = mode === "soft";
  const briefing = buildEscalationBriefing({
    mode,
    summary,
    reason,
    messages,
    customerName,
  });

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

        {/* Options chips. Visual only — actions are wired in the composer
            below this panel. Topic-aware via the briefing. */}
        <div className="mt-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9aa0a6]">
            Options
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {briefing.options.map((opt) => (
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
