import type { Appointment } from "@/lib/api";

/**
 * Shared predicate for "is this appointment active right now?".
 *
 * An appointment is active when:
 *   - its status is not a terminal one (`cancelled` / `completed`), AND
 *   - its owning conversation is still in the active inbox — i.e. the
 *     conversation has NOT been archived or deleted on this device.
 *
 * The conversation check honours auto-restore: `activeConversationKeys`
 * is produced by `useActiveConversationKeys`, which already drops
 * hidden + archived rows AND auto-un-archives on a fresh inbound.
 *
 * Orphan rule: a backend appointment with no `conversationId` (a
 * standalone calendar entry) cannot be matched to a conversation, so
 * we keep it visible. We never silently drop a row we can't link.
 *
 * `conversationsReady` distinguishes "conversations endpoint hasn't
 * resolved yet" from "conversation list is genuinely empty". When
 * conversations haven't loaded we keep every appointment visible so
 * the badge / list don't flicker to empty during a normal page load.
 */
export function filterActiveAppointments(
  appointments: ReadonlyArray<Appointment>,
  activeConversationKeys: ReadonlySet<string>,
  conversationsReady: boolean,
): Appointment[] {
  return appointments.filter((a) => {
    // Defensive: the current `AppointmentStatus` union doesn't include
    // terminal states, but the backend may add them later. Compare via
    // a widened string so the predicate stays correct without forcing
    // a type-only follow-up.
    const status = a.status as string;
    if (status === "cancelled" || status === "completed") return false;
    if (!conversationsReady) return true;
    const cid = typeof a.conversationId === "string" ? a.conversationId.trim() : "";
    if (!cid) return true;
    return activeConversationKeys.has(cid);
  });
}
