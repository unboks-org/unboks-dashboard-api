/**
 * EscalationReasonPanel — "Decision needed" card.
 *
 * Premium decision-first surface. Inspired by Mercury approval cards
 * and Intercom/Front ticket summaries (via Refero): a calm white card
 * with three labelled answer rows and no competing action surface —
 * the operator's actions live in the Instructions to Agent composer
 * directly below this card, so the whole escalation reads as a single
 * decision flow.
 *
 * Sourcing
 * ========
 * The three sections are still built by `buildEscalationBriefing`:
 *   - What happened       → briefing.reason
 *   - Customer wants      → briefing.customerWants
 *   - Suggested next step → briefing.marinaNeeds
 *
 * Previously this card hosted four chip-style action buttons (Guide
 * Agent / Ask for more details / Take over / Resolve). They've been
 * removed: the composer below is now the single primary action
 * surface (Send / Resolve / Send & Resolve), and Take over / Hand
 * back already lives in that composer too. This avoids two competing
 * action rows in the same flow.
 *
 * No backend handlers change. No new data is invented.
 */

import { motion } from "framer-motion";
import type { ApiMessage } from "@/lib/api";
import { buildEscalationBriefing } from "@/lib/escalation-summary";
import { buildMermaidEscalationBriefing } from "@/lib/mermaid-escalation-briefing";
import { isMermaidReservationTenant, tenantText } from "@/lib/tenant-ui";

/**
 * Kept exported for compatibility with parent code that still imports
 * the type. The panel no longer dispatches actions itself.
 */
export type ChipAction =
  | { kind: "draft"; text: string }
  | { kind: "focus" }
  | { kind: "takeover" }
  | { kind: "handback" }
  | { kind: "resolve" };

interface EscalationReasonPanelProps {
  mode: "soft" | "hard" | "order";
  summary?: string | null;
  reason?: string | null;
  aiMuted?: boolean;
  messages?: ApiMessage[];
  customerName?: string | null;
  recommendedOptions?: string[] | null;
  proposedTimes?: string[] | null;
  /** Backend-supplied "what the customer wants" line (verbatim if set). */
  customerWants?: string | null;
  /** Backend-supplied "what the operator needs to decide" line (verbatim if set). */
  operatorNeedsToDecide?: string | null;
  guestMessage?: string | null;
  /**
   * Retained for backward compatibility with the parent's wiring.
   * Currently unused — the action surface lives in the composer.
   */
  onChipAction?: (action: ChipAction) => void;
}

export function EscalationReasonPanel({
  mode,
  summary,
  reason,
  messages,
  customerName,
  recommendedOptions,
  proposedTimes,
  customerWants,
  operatorNeedsToDecide,
  guestMessage,
}: EscalationReasonPanelProps) {
  const isSoft = mode === "soft";
  const isOrder = mode === "order";
  const mermaid = isMermaidReservationTenant();
  const buildBriefing = mermaid ? buildMermaidEscalationBriefing : buildEscalationBriefing;
  const briefing = buildBriefing({
    mode,
    summary,
    reason,
    messages,
    customerName,
    recommendedOptions,
    proposedTimes,
    customerWants,
    operatorNeedsToDecide,
  });

  return (
    <section
      aria-label={mermaid ? "Crew decision needed" : tenantText("Decision needed", "Respuesta necesaria")}
      className="bg-white px-3 sm:px-4 pt-3 pb-2 flex-shrink-0"
    >
      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 30, mass: 1 }}
        className="rounded-xl border border-[#e6e8eb] bg-[#fbfbfd] px-3.5 py-3 sm:px-5 sm:py-4 shadow-sm"
        aria-labelledby="decision-needed-title"
      >
        {/* Card title row.
            The mode/status indicator already lives in the conversation
            header (mode toggle: "Agent needs help" / "Human takeover").
            To honor the spec's "single status surface" rule we
            deliberately do NOT repeat that pill here. Agent-muted state
            is shown in the composer where it actually changes behavior. */}
        <header className="mb-3 flex items-start justify-between gap-3">
          <h2
            id="decision-needed-title"
            className="text-[14px] font-semibold tracking-[-0.01em] text-[#111827]"
          >
            {mermaid ? "Crew decision needed" : tenantText("Decision needed", "Respuesta necesaria")}
          </h2>
        </header>

        {/* Three section answer rows. Each row has a quiet uppercase
            label and a one-paragraph answer in primary text. The grid
            collapses to a single column on mobile. */}
        <dl className="grid grid-cols-1 gap-y-3 gap-x-6 sm:grid-cols-2">
          <Section label={mermaid ? "Why TRACY needs the crew" : tenantText("What happened", "Qué ha ocurrido")} className="sm:col-span-2">
            {briefing.reason}
          </Section>
          <Section label={mermaid ? "Guest request" : isOrder
            ? tenantText("Order status", "Estado de la solicitud")
            : isSoft
            ? tenantText("Customer wants", "Qué solicita la persona")
            : tenantText("Customer needs", "Qué necesita la persona")}>
            {briefing.customerWants}
          </Section>
          <Section label={mermaid ? "What the crew needs to decide" : isOrder
            ? tenantText("Operator next step", "Siguiente paso del equipo")
            : tenantText("Suggested next step", "Siguiente paso sugerido")}>
            {briefing.marinaNeeds}
          </Section>
        </dl>
        {mermaid && guestMessage ? <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5f6368]">Guest message that needs attention</p>
          <blockquote className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-[1.55] text-[#1f2937]">{guestMessage}</blockquote>
        </div> : null}
      </motion.article>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Local presentational helpers
// ---------------------------------------------------------------------------

function Section({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5f6368]">
        {label}
      </dt>
      <dd className="mt-1 text-[13.5px] leading-[1.55] text-[#1f2937]">
        {children}
      </dd>
    </div>
  );
}
