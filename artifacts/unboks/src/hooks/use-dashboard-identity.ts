import { useCallback, useEffect, useState } from "react";
import type { TaskUser } from "@/lib/tasks-api";

/**
 * Operator identity toggle — Calvin vs Jr — backed by localStorage.
 *
 * Calvin and Jr share the same dashboard login (one bearer token), so the
 * backend cannot tell them apart on its own. This hook lets the human at the
 * keyboard declare which of them is currently using the dashboard so newly
 * created local tasks get the correct `createdBy` label.
 *
 * - Stored under `unboks_dashboard_identity` so it survives reloads.
 * - Defaults to "Calvin" the first time the dashboard is opened.
 * - Reactive across tabs (storage event) and within the same tab via a
 *   custom event, so the header pill and any consumer always agree.
 */

const STORAGE_KEY = "unboks_dashboard_identity";
const EVENT_NAME = "unboks_dashboard_identity_changed";
const VALID: TaskUser[] = ["Calvin", "Jr"];
const DEFAULT_IDENTITY: TaskUser = "Calvin";

function readIdentity(): TaskUser {
  if (typeof localStorage === "undefined") return DEFAULT_IDENTITY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (VALID as string[]).includes(raw)) return raw as TaskUser;
  } catch {
    // SSR / privacy-mode — fall through to default.
  }
  return DEFAULT_IDENTITY;
}

/** Read the current identity from outside React (e.g. plain modules). */
export function getCurrentDashboardIdentity(): TaskUser {
  return readIdentity();
}

/** The "natural" person to send a task to, given the current identity. */
export function getOtherDashboardIdentity(self: TaskUser): TaskUser {
  return self === "Calvin" ? "Jr" : "Calvin";
}

export function useDashboardIdentity(): {
  identity: TaskUser;
  otherIdentity: TaskUser;
  setIdentity: (next: TaskUser) => void;
} {
  const [identity, setIdentityState] = useState<TaskUser>(readIdentity);

  useEffect(() => {
    const sync = () => setIdentityState(readIdentity());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const setIdentity = useCallback((next: TaskUser) => {
    if (!(VALID as string[]).includes(next)) return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage may be full or blocked; in-memory update still keeps UI
      // honest for this session.
    }
    setIdentityState(next);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }, []);

  return { identity, otherIdentity: getOtherDashboardIdentity(identity), setIdentity };
}
