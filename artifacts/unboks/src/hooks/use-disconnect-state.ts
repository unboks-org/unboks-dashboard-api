import { useCallback, useEffect, useState } from "react";
import { getClientSlug } from "@/lib/tenant";

/**
 * Local persistence of the "Disconnect Unboks" workspace state.
 *
 * Why local-only:
 * The canonical Python backend (api.unboks.org) does not yet expose a
 * `POST /settings/disconnect-unboks` endpoint. Per the task brief
 * ("Do not fake successful provider disconnection. If the backend can
 * only pause/mute Unboks but cannot revoke provider/channel
 * connections yet, label backend behavior accurately") we attempt the
 * real call and, on a missing-endpoint response (404 / 405 / 501),
 * fall back to recording the disconnect *request* on this device with
 * status `"requested"`. The Settings card surfaces that honestly:
 * "Disconnect requested — contact your Unboks operator to complete."
 *
 * On a successful 2xx, we record `"confirmed"` so the dashboard can
 * show a true Disconnected status. The hook is per-tenant
 * (`getClientSlug()`) so switching workspaces doesn't carry the flag
 * across.
 *
 * Cross-tab + in-tab sync mirrors `useArchivedConversations`:
 * `storage` event for other tabs, custom event for the current tab.
 */

const EVENT_NAME = "unboks_disconnect_state_changed";

export type DisconnectStatus = "active" | "requested" | "confirmed";

export interface DisconnectRecord {
  status: DisconnectStatus;
  /** ISO timestamp of when the action was taken / requested. */
  at: string;
  /**
   * Human-readable reason returned from / surfaced to the operator.
   * For `"requested"` this typically explains the local-only fallback.
   */
  note?: string;
}

function storageKey(slug: string): string {
  return `unboks_disconnect_state_${slug}`;
}

function readFromStorage(slug: string): DisconnectRecord | null {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const status = (parsed as { status?: unknown }).status;
    const at = (parsed as { at?: unknown }).at;
    if (status !== "requested" && status !== "confirmed") return null;
    if (typeof at !== "string" || !at.trim()) return null;
    if (!Number.isFinite(Date.parse(at))) return null;
    const note = (parsed as { note?: unknown }).note;
    return {
      status,
      at,
      note: typeof note === "string" ? note : undefined,
    };
  } catch {
    return null;
  }
}

function writeToStorage(slug: string, rec: DisconnectRecord | null): void {
  try {
    if (rec === null) {
      localStorage.removeItem(storageKey(slug));
    } else {
      localStorage.setItem(storageKey(slug), JSON.stringify(rec));
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Quota / privacy mode: non-fatal; the in-memory state still
    // reflects the operator's most recent action for this session.
  }
}

export interface DisconnectStateApi {
  status: DisconnectStatus;
  record: DisconnectRecord | null;
  /** Mark the workspace as disconnected (status `"confirmed"`). */
  setConfirmed: (note?: string) => void;
  /**
   * Mark the workspace as a pending local request — used when the
   * backend doesn't yet support disconnect and the operator has
   * acknowledged that the Unboks team will be looped in to complete
   * the action.
   */
  setRequested: (note?: string) => void;
  /** Clear the disconnect flag (used by a future Reactivate flow). */
  clear: () => void;
}

export function useDisconnectState(): DisconnectStateApi {
  const [slug] = useState<string>(() => getClientSlug());
  const [record, setRecord] = useState<DisconnectRecord | null>(() => readFromStorage(slug));

  useEffect(() => {
    const sync = () => setRecord(readFromStorage(slug));
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, [slug]);

  const setConfirmed = useCallback(
    (note?: string) => {
      const rec: DisconnectRecord = {
        status: "confirmed",
        at: new Date().toISOString(),
        note,
      };
      writeToStorage(slug, rec);
      setRecord(rec);
    },
    [slug],
  );

  const setRequested = useCallback(
    (note?: string) => {
      const rec: DisconnectRecord = {
        status: "requested",
        at: new Date().toISOString(),
        note,
      };
      writeToStorage(slug, rec);
      setRecord(rec);
    },
    [slug],
  );

  const clear = useCallback(() => {
    writeToStorage(slug, null);
    setRecord(null);
  }, [slug]);

  return {
    status: record?.status ?? "active",
    record,
    setConfirmed,
    setRequested,
    clear,
  };
}
