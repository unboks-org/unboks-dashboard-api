import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "unboks_cloud_knowledge_connections";
const EVENT_NAME = "unboks_cloud_knowledge_connections_changed";

// Mirrors the planned backend data shape:
//   GET    /api/{client}/dashboard/api/knowledge/cloud-connections
//   POST   /api/{client}/dashboard/api/knowledge/cloud-connections/{provider}/connect
//   POST   /api/{client}/dashboard/api/knowledge/cloud-connections/{provider}/sync
//   DELETE /api/{client}/dashboard/api/knowledge/cloud-connections/{provider}
export type CloudProvider =
  | "google_drive"
  | "onedrive"
  | "dropbox"
  | "sharepoint"
  | "box";

export type CloudConnectionStatus =
  | "connected"
  | "needs_reconnect"
  | "syncing"
  | "failed";

export interface CloudConnection {
  provider: CloudProvider;
  connected: boolean;
  folderName?: string;
  lastSyncedAt?: string;
  status?: CloudConnectionStatus;
}

export const CLOUD_PROVIDERS: {
  id: CloudProvider;
  label: string;
  /** Short blurb shown under the provider name on the card. */
  blurb: string;
}[] = [
  {
    id: "google_drive",
    label: "Google Drive",
    blurb: "Docs, Sheets, PDFs, menus.",
  },
  {
    id: "onedrive",
    label: "OneDrive",
    blurb: "Word, Excel, PDFs from Microsoft 365.",
  },
  {
    id: "dropbox",
    label: "Dropbox",
    blurb: "Shared folders with policies and price lists.",
  },
  {
    id: "sharepoint",
    label: "SharePoint",
    blurb: "Team document libraries.",
  },
  {
    id: "box",
    label: "Box",
    blurb: "Secure document folders.",
  },
];

function readFromStorage(): Record<CloudProvider, CloudConnection> {
  // Pre-backend safety net: every provider is forced to `connected: false`
  // until the real cloud-connections endpoint exists. We never want a
  // stale localStorage entry from a future preview build to surface as
  // "Connected" to the customer. The map shape is preserved so the UI
  // and disconnect flow stay simple.
  return {
    google_drive: { provider: "google_drive", connected: false },
    onedrive: { provider: "onedrive", connected: false },
    dropbox: { provider: "dropbox", connected: false },
    sharepoint: { provider: "sharepoint", connected: false },
    box: { provider: "box", connected: false },
  };
}

function persist(map: Record<CloudProvider, CloudConnection>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // ignore
  }
}

/**
 * Local-only cloud connection registry for v1. Connect flows are not
 * wired to a backend yet — the calling component shows a calm
 * "Cloud connections will be connected by the Unboks team." note when
 * the user clicks Connect, and we never flip `connected` to true on our
 * own. The DELETE flow is local-only safe (just clears any saved
 * placeholder state).
 */
export function useCloudKnowledgeConnections() {
  const [connections, setConnections] = useState<
    Record<CloudProvider, CloudConnection>
  >(readFromStorage);

  useEffect(() => {
    const sync = () => setConnections(readFromStorage());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const list = useCallback((): CloudConnection[] => {
    return CLOUD_PROVIDERS.map((p) => connections[p.id]);
  }, [connections]);

  const disconnect = useCallback((provider: CloudProvider) => {
    setConnections((current) => {
      const next = {
        ...current,
        [provider]: { provider, connected: false },
      };
      persist(next);
      return next;
    });
  }, []);

  return { list, disconnect };
}
