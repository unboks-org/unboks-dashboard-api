import { isMermaidReservationTenant, tenantText } from "@/lib/tenant-ui";

const mermaidCopy: Record<string, string> = {
  "Instructions to Agent": "Guidance for TRACY",
  "Tell the Agent exactly what to say or do next.":
    "Tell TRACY what the Mermaid crew has confirmed. TRACY uses your guidance to reply to the guest.",
  "Example: Confirm Sunday at 08:00 and ask the customer to confirm their phone number.":
    "Explain how the crew can help with this guest’s trip or reservation. Include any confirmed arrangements, assistance available, or limitations TRACY should explain.",
  "Switch to human takeover": "Take over & reply to guest",
  "Hand back to Agent": "Return to TRACY",
};

/** Only transforms our static interface copy, never backend/guest messages. */
export function escalationText(english: string, spanish: string): string {
  if (!isMermaidReservationTenant()) return tenantText(english, spanish);
  return (
    mermaidCopy[english] ??
    english
      .replace(/\byour Agent\b|\bthe Agent\b|\bAgent\b/g, "TRACY")
      .replace(/\bcustomer\b/g, "guest")
  );
}
