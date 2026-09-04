import type {
  EscalationBriefing,
  buildEscalationBriefing,
} from "@/lib/escalation-summary";
import { latestConversationMessage } from "@/lib/conversation-message-order";

/** Mermaid is guest/trip operations, not the generic sales meeting workflow.
 * A weekday, pickup time, or a later "are you there?" must never replace the
 * recorded crew decision with an invented appointment request. */
export function buildMermaidEscalationBriefing({
  mode,
  summary,
  reason,
  customerWants,
  operatorNeedsToDecide,
  messages = [],
}: Parameters<typeof buildEscalationBriefing>[0]): EscalationBriefing {
  const lastGuest = latestConversationMessage(
    messages,
    (message) => message.role === "user",
  );
  return {
    reason:
      summary?.trim() ||
      reason?.trim() ||
      "TRACY flagged this Mermaid guest conversation for crew review. A specific escalation reason has not been provided.",
    customerWants:
      customerWants?.trim() ||
      (lastGuest?.content
        ? `Latest guest message: “${lastGuest.content}”`
        : "The guest’s request is not available yet. Open the conversation for context."),
    marinaNeeds:
      operatorNeedsToDecide?.trim() ||
      (mode === "hard"
        ? "Review the guest’s request and reply directly on behalf of Mermaid. Confirm only arrangements the crew has verified."
        : "Tell TRACY how the Mermaid crew can handle this guest’s request, or take over and reply directly. Confirm only arrangements the crew has verified."),
    options: [],
  };
}
