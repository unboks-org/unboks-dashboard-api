/**
 * appointment-classifier — centralised classification facade.
 *
 * This file is the SINGLE import surface every UI consumer should use
 * to decide whether a given conversation or backend row is a real
 * Appointment, an Escalation, or normal Inbox traffic. The actual
 * heuristics live alongside the data they read:
 *
 *   - `appointment-detector.ts`  — slot/intent regexes, strict
 *                                  "only-confirmed" detector, backend
 *                                  row validator.
 *   - `active-appointments.ts`   — owning-conversation liveness check.
 *
 * The facade exists so a future refactor (e.g. moving slot extraction
 * to a worker, or replacing the regex with an LLM call) only needs to
 * touch one re-exported module while every page / hook keeps the
 * stable import path:
 *
 *   import {
 *     shouldShowInAppointments,
 *     classifyConversationSchedulingState,
 *     dedupeAppointments,
 *     filterActiveAppointments,
 *     validateBackendAppointment,
 *     detectAppointment,
 *     hasSchedulingSignals,
 *   } from "@/lib/appointment-classifier";
 *
 * Lifecycle (the contract the whole frontend obeys)
 * =================================================
 *
 *   Stage 1 — customer_intent
 *     Customer wants an appointment / booking / intake.
 *     → Inbox only. No Escalation row, no Appointment row.
 *
 *   Stage 2 — availability_requested
 *     Marina asked the customer for 2-3 candidate times.
 *     → Inbox only.
 *
 *   Stage 3 — customer_proposed_slots
 *     Customer offered one or more candidate times. Multiple
 *     candidates is the canonical "needs operator decision" signal.
 *     → Escalations (when the backend emits the escalation row).
 *     → Never Appointments. Multi-slot offers are blocked from the
 *       detector (`pickStatus` rejects multi-slot in branch 1b and
 *       step 3) and from backend rows (`validateBackendAppointment`
 *       hides backend "confirmed" when only multi-slot offers exist
 *       in the linked thread).
 *
 *   Stage 4 — operator_selected_slot
 *     Operator chose a specific slot, Marina has not yet asked the
 *     customer to confirm OR the customer has not yet replied.
 *     → Still Escalation / Inbox. Backend may emit `pending`. Frontend
 *       does not promote this to a confirmed Appointment.
 *
 *   Stage 5 — customer_confirmed_slot
 *     Customer accepted the chosen slot ("Yes, Monday 11:00 works").
 *     → Appointment, status = "confirmed". The detector confirms via
 *       step 3 (later customer reply) or branch 1b (customer's chosen
 *       msg itself is single-slot acceptance).
 *
 *   Stage 6 — operator_final_confirmation
 *     Operator marked the booking final without needing customer
 *     confirmation, OR backend has stored a confirmed row that the
 *     conversation evidence corroborates / is silent about.
 *     → Appointment, status = "confirmed".
 *
 * Status mapping — frontend `AppointmentStatus` is `"confirmed" |
 * "pending" | "detected"`. The richer set the product brief mentions
 * (needs_operator_decision, pending_team_confirmation,
 * pending_customer_confirmation) is not currently emitted by the
 * backend; when it is, map them like this without changing UI:
 *   needs_operator_decision        → escalation row only, no Appointment
 *   pending_team_confirmation      → AppointmentStatus "pending"
 *   pending_customer_confirmation  → AppointmentStatus "pending"
 *   confirmed                      → AppointmentStatus "confirmed"
 *   cancelled / completed          → terminal, dropped by
 *                                    `filterActiveAppointments`
 *
 * Dedupe — both backend rows and detected rows are de-duplicated by
 * `${conversationId}|${dateTimeLabel}` in `use-appointments.ts`.
 * Backend rows take precedence on the dedup so a corroborated backend
 * "confirmed" never gets shadowed by the equivalent detected row. Any
 * additional alternative-slot rows the backend emits for the same
 * conversation are filtered out by `validateBackendAppointment`
 * BEFORE dedup, so the operator never sees two confirmed cards for
 * one customer when only one slot was actually agreed.
 *
 * No em dashes in user-facing strings produced by callers of this
 * facade (em dashes inside this file's code-comment prose are fine).
 */

import type { Appointment, ConversationDetail } from "@/lib/api";

export {
  detectAppointment,
  hasSchedulingSignals,
  isMultiSlotOffer,
  validateBackendAppointment,
  type ValidateBackendArgs,
} from "@/lib/appointment-detector";

export { filterActiveAppointments } from "@/lib/active-appointments";

/**
 * The lifecycle stage a conversation is currently in. Returned by
 * `classifyConversationSchedulingState`.
 *
 * The frontend uses this only for documentation / future routing
 * decisions. The two operational predicates the UI actually consumes
 * are `shouldShowInAppointments` (gates the Appointments page) and
 * the backend-emitted escalation row (gates the Escalations page).
 */
export type ConversationSchedulingStage =
  | "no_scheduling_activity"
  | "customer_intent"
  | "availability_requested"
  | "customer_proposed_slots"
  | "operator_selected_slot"
  | "customer_confirmed_slot";

import {
  detectAppointment,
  hasSchedulingSignals,
  isMultiSlotOffer,
} from "@/lib/appointment-detector";

/**
 * Classify a conversation's current position in the appointment
 * lifecycle. Used by future UX (e.g. an Escalation reason badge that
 * reads "Customer offered 2 slots — needs your decision") and by the
 * audit report. The function is read-only and side-effect-free.
 */
export function classifyConversationSchedulingState(
  detail: ConversationDetail | null,
): ConversationSchedulingStage {
  if (!detail) return "no_scheduling_activity";
  const msgs = Array.isArray(detail.messages) ? detail.messages : [];
  if (msgs.length === 0) return "no_scheduling_activity";

  // Easiest signal: if the strict detector emits a confirmed row,
  // we're at stage 5 (or 6 — indistinguishable from message text
  // alone, both surface in the Appointments page identically).
  const evidence = detectAppointment({
    detail,
    conversationId: "classify",
    channel: "classify",
    customerName: detail.name ?? "",
  });
  if (evidence) return "customer_confirmed_slot";

  // Any multi-slot message in the thread → customer is offering
  // candidates and somebody (operator) needs to choose.
  if (msgs.some((m) => isMultiSlotOffer(m.content))) {
    return "customer_proposed_slots";
  }

  // Did Marina or the operator already ask for availability?
  // Heuristic: an assistant/operator message that uses scheduling
  // intent words AND no concrete day+time pin.
  const askedForTimes = msgs.some(
    (m) =>
      (m.role === "assistant" || m.role === "operator") &&
      /\b(when|what time|which time|availability|times work|slots? work|work for you)\b/i.test(
        m.content,
      ),
  );
  if (askedForTimes) return "availability_requested";

  // Any scheduling signal at all → customer-stated intent.
  if (msgs.some((m) => hasSchedulingSignals(m.content))) {
    return "customer_intent";
  }

  return "no_scheduling_activity";
}

/**
 * Should this appointment row appear on the Appointments page?
 *
 * Two filters apply:
 *   1. Status — confirmed and pending rows are appointments. Detected
 *      rows still surface (with a "Detected, pending sync" label) to
 *      avoid hiding state the operator is debugging, but they never
 *      carry a green Confirmed badge.
 *   2. Activity — the owning conversation must not be a terminal
 *      state (cancelled/completed). The page-level liveness filter
 *      (`filterActiveAppointments`) layers on top to drop rows whose
 *      conversation has been archived/deleted on this device.
 *
 * `validateBackendAppointment` runs UPSTREAM of this predicate inside
 * `use-appointments.ts` — by the time a row reaches this function, a
 * backend "confirmed" that contradicts the conversation has already
 * been dropped.
 */
export function shouldShowInAppointments(apt: Appointment): boolean {
  const status = apt.status as string;
  if (status === "cancelled" || status === "completed") return false;
  return true;
}
