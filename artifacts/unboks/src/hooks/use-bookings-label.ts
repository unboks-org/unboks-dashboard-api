/**
 * Single source of truth for the workspace label that points at the
 * Appointments page. Both the desktop sidebar (Drawer in md+ mode) and
 * the mobile drawer/hamburger menu read from here, so they can never
 * disagree.
 *
 * R2-39: removed the per-device localStorage override and the Settings
 * "Bookings / Orders" picker. That mechanism only stored on whichever
 * device set it, so mobile and desktop drifted apart (mobile showed
 * "Orders", desktop showed "Appointments"). Per Calvin's "no fake
 * persistence" rule, until there is a tenant-scoped backend setting
 * for this label, the dashboard renders the canonical product name.
 *
 * If a tenant-configurable label is needed in the future, replace
 * BOOKINGS_LABEL below with a value sourced from a tenant-scoped
 * backend endpoint (e.g. /settings/workspace-labels) — every consumer
 * already routes through this hook, so no other file needs to change.
 */

export const BOOKINGS_LABEL = "Appointments";

export function useBookingsLabel(): { label: string } {
  return { label: BOOKINGS_LABEL };
}
