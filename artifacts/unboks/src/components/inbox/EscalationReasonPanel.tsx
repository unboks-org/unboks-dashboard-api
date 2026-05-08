/**
 * EscalationReasonPanel — "Decision needed" card.
 *
 * Premium decision-first surface that replaces the previous debug-style
 * "Escalation reason" card. Inspired by Mercury approval cards, Linear
 * issue detail action panels, and Intercom/Front ticket summaries seen
 * via Refero: a calm white card on a near-white surface with one
 * single section title, three clearly labelled answer rows, and a
 * single horizontal row of real action buttons (not chips).
 *
 * Sourcing
 * ========
 * The three sections are still built by `buildEscalationBriefing`:
 *   - What happened       → briefing.reason
 *   - Customer wants      → briefing.customerWants
 *   - Suggested next step → briefing.marinaNeeds
 *
 * `briefing.options` is intentionally NOT rendered as chips anymore.
 * Operators told us those chips read as "tags" rather than actions; the
 * new design replaces them with four real, fixed action buttons that
 * map cleanly to the existing `ChipAction` contract so no parent /
 * composer wiring needs to change.
 *
 * Action buttons (the only four, always in this order):
 *   1. Guide Agent          → { kind: "focus" }     (jumps to composer)
 *   2. Ask for more details → { kind: "draft", … }  (mode-appropriate scaffold)
 *   3. Take over / Hand back → { kind: "takeover" } in soft
 *                              { kind: "handback" } in hard
 *   4. Resolve              → { kind: "resolve" }
 *
 * No backend handlers change. No new data is invented.
 */

import type { ApiMessage } from "@/lib/api";
import { buildEscalationBriefing } from "@/lib/escalation-summary";
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
  recommendedOptions?: string[] | null;
  proposedTimes?: string[] | null;
  /**
   * Dispatched when an action button is clicked. Inbox forwards this to
   * the EscalationReplyComposer's imperative handle.
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

  const firstName = pickFirstName(customerName);

  const dispatch = (action: ChipAction) => {
    if (onChipAction) onChipAction(action);
  };

  // "Ask for more details" — uses the same scaffolds the chip mapping
  // shipped, so the wording stays consistent with anything operators
  // already learned.
  const askForMoreDetailsAction: ChipAction = isSoft
    ? {
        kind: "draft",
        text: `Please ask ${firstName} for more details so we can help properly.`,
      }
    : {
        kind: "draft",
        text: "Could you share a few more details so I can help properly?",
      };

  return (
    <section
      aria-label="Decision needed"
      className="border-b border-[#e8eaed] bg-white px-3 sm:px-4 py-3 flex-shrink-0"
    >
      <article
        className="rounded-xl border border-[#e6e8eb] bg-[#fbfbfd] px-3.5 py-3 sm:px-5 sm:py-4"
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
            Decision needed
          </h2>
        </header>

        {/* Three section answer rows. Each row has a quiet uppercase
            label and a one-paragraph answer in primary text. The grid
            collapses to a single column on mobile. */}
        <dl className="grid grid-cols-1 gap-y-3 gap-x-6 sm:grid-cols-2">
          <Section label="What happened" className="sm:col-span-2">
            {briefing.reason}
          </Section>
          <Section label={isSoft ? "Customer wants" : "Customer needs"}>
            {briefing.customerWants}
          </Section>
          <Section label="Suggested next step">{briefing.marinaNeeds}</Section>
        </dl>

        {/* Action row — four real buttons, never chips. Order is locked.
            Hierarchy:
              1) Guide Agent          → primary soft accent
              2) Ask for more details → secondary outline
              3) Take over / Hand back → secondary outline (neutral)
              4) Resolve              → quiet ghost
            All buttons share the same height/padding so they read as a
            single grouped row, never as random tags. They wrap cleanly
            on mobile. */}
        <div
          role="group"
          aria-label="Escalation actions"
          className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#eef0f2] pt-3"
        >
          {/* Guide Agent — primary soft accent */}
          <button
            type="button"
            onClick={() => dispatch({ kind: "focus" })}
            title={
              isSoft
                ? "Write guidance for your Agent."
                : "Write a reply to the customer."
            }
            className={cn(
              "inline-flex items-center justify-center rounded-full px-3.5 py-1.5 text-[12.5px] font-medium",
              "bg-[#1a73e8] text-white shadow-sm transition-colors",
              "hover:bg-[#1765cc] active:bg-[#185abc]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1",
            )}
          >
            Guide Agent
          </button>

          {/* Ask for more details — outline secondary */}
          <ActionButton
            onClick={() => dispatch(askForMoreDetailsAction)}
            title={
              isSoft
                ? "Ask your Agent to collect more details from the customer."
                : "Ask the customer for more details."
            }
          >
            Ask for more details
          </ActionButton>

          {/* Take over (soft) / Hand back to Agent (hard) — outline */}
          {isSoft ? (
            <ActionButton
              onClick={() => dispatch({ kind: "takeover" })}
              title="Switch to human takeover and reply to the customer yourself."
            >
              Take over
            </ActionButton>
          ) : (
            <ActionButton
              onClick={() => dispatch({ kind: "handback" })}
              title="Hand the conversation back to your Agent."
            >
              Hand back to Agent
            </ActionButton>
          )}

          {/* Resolve — quiet outline, sits inline with the others so it
              never floats alone on the far right (the previous ml-auto
              made it read as disconnected on mobile). */}
          <button
            type="button"
            onClick={() => dispatch({ kind: "resolve" })}
            title="Mark this escalation as resolved."
            className={cn(
              "inline-flex items-center justify-center rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium",
              "border-[#e2e6ec] bg-white text-[#5f6368] shadow-sm transition-colors",
              "hover:bg-[#f1f3f4] hover:text-[#202124] hover:border-[#d2d6dc] active:bg-[#e8eaed]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1",
            )}
          >
            Resolve
          </button>
        </div>
      </article>
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

function ActionButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center justify-center rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium",
        "border-[#dadce0] bg-white text-[#3c4043] shadow-sm transition-colors",
        "hover:bg-[#f8f9fa] hover:border-[#bdc1c6] active:bg-[#f1f3f4]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1",
      )}
    >
      {children}
    </button>
  );
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
