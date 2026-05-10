/**
 * Deep-link intent reader.
 *
 * Backend alert emails / WhatsApp alerts now embed links that should
 * open the dashboard directly to a specific escalation or appointment.
 * Two link formats are supported:
 *
 *   1. Path-based (PRIMARY, what the backend sends today):
 *
 *        https://dashboard.unboks.org/<tenant>/escalations/<id>
 *        https://dashboard.unboks.org/<tenant>/appointments/<id>
 *
 *      The `<tenant>` segment is the artifact's BASE_URL prefix and is
 *      consumed by Wouter (`<WouterRouter base={BASE_URL} />`), so by
 *      the time we read the path here it's already stripped — we only
 *      see `/escalations/<id>` / `/appointments/<id>`.
 *
 *   2. Query fallback (still accepted, for older email templates and
 *      hand-crafted bookmarks):
 *
 *        ?view=escalations&escalationId=<id>
 *        ?view=appointments&appointmentId=<id>
 *
 *      Either `view=…` or just the `*Id` parameter is enough on its
 *      own; both are accepted to be tolerant of partial links.
 *
 * The path form always wins over the query form when both are present.
 */

import { useRoute } from "wouter";

export type DeepLinkKind = "escalation" | "appointment";

export interface DeepLink {
  /** What the deep link targets, or `null` if no deep link is present. */
  kind: DeepLinkKind | null;
  /**
   * The id of the target. May be `null` even when `kind` is set: e.g.
   * `?view=escalations` with no id is interpreted as "open the
   * Escalations tab" without auto-selecting a row.
   */
  id: string | null;
  /** Where the intent came from. Useful for the "strip query after consume" cleanup. */
  source: "path" | "query" | null;
}

const NO_LINK: DeepLink = { kind: null, id: null, source: null };

function readQuery(): { view: string | null; escalationId: string | null; appointmentId: string | null } {
  // SSR / unusual environments: window may not exist. Fail closed.
  if (typeof window === "undefined") {
    return { view: null, escalationId: null, appointmentId: null };
  }
  try {
    const p = new URLSearchParams(window.location.search);
    const norm = (s: string | null) => (s && s.trim().length > 0 ? s.trim() : null);
    return {
      view: norm(p.get("view")),
      escalationId: norm(p.get("escalationId")),
      appointmentId: norm(p.get("appointmentId")),
    };
  } catch {
    return { view: null, escalationId: null, appointmentId: null };
  }
}

/**
 * React hook: reads the current deep-link intent from the wouter route
 * and the query string. Reactive to route changes via `useRoute`.
 *
 * NOTE: query-string changes don't re-render this hook on their own —
 * the consumer should rely on the fact that we only consume each id
 * once (see usage in Inbox/Bookings) and clean the query string up
 * with `replaceState` after consumption. This matches the prior
 * `?c=<id>` deep-link behaviour already used by the inbox.
 */
export function useDeepLink(): DeepLink {
  const [matchEscWithId, escParams] = useRoute<{ id: string }>("/escalations/:id");
  const [matchEscBare] = useRoute("/escalations");
  const [matchAptWithId, aptParams] = useRoute<{ id: string }>("/appointments/:id");

  if (matchEscWithId && escParams?.id) {
    return {
      kind: "escalation",
      id: safeDecode(escParams.id),
      source: "path",
    };
  }
  if (matchAptWithId && aptParams?.id) {
    return {
      kind: "appointment",
      id: safeDecode(aptParams.id),
      source: "path",
    };
  }

  // Path-only `/escalations` is treated as "open Escalations tab"; if a
  // query id is present alongside it we'll still pick it up below.
  const q = readQuery();

  if (matchEscBare) {
    return {
      kind: "escalation",
      id: q.escalationId ?? null,
      source: q.escalationId ? "query" : "path",
    };
  }

  // Query fallback at any other route (typically `/`).
  if (q.view === "escalations" || q.escalationId) {
    return {
      kind: "escalation",
      id: q.escalationId,
      source: "query",
    };
  }
  if (q.view === "appointments" || q.appointmentId) {
    return {
      kind: "appointment",
      id: q.appointmentId,
      source: "query",
    };
  }

  return NO_LINK;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Strip deep-link query params (`view`, `escalationId`, `appointmentId`)
 * from the current URL without triggering a navigation or page
 * reload. Used after a deep link has been consumed so that:
 *
 *   - a manual refresh doesn't re-fire the auto-open, and
 *   - normal sidebar navigation isn't fighting with the deep link.
 *
 * Path-based deep links are NOT modified here — the path IS the
 * canonical location and refreshing it should re-deep-link
 * intentionally.
 */
export function clearDeepLinkQuery(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const k of ["view", "escalationId", "appointmentId"]) {
      if (url.searchParams.has(k)) {
        url.searchParams.delete(k);
        changed = true;
      }
    }
    if (changed) window.history.replaceState({}, "", url.toString());
  } catch {
    // best-effort
  }
}

/**
 * Storage key used by `ProtectedRoute` to remember where the user was
 * trying to go before being bounced to /login, and by `AuthProvider`
 * to send them there after a successful login. Kept in sessionStorage
 * (per-tab, cleared on browser close) so a deep link from email opens
 * exactly once and never haunts a future tab.
 */
export const LOGIN_REDIRECT_STORAGE_KEY = "unboks_login_redirect";
