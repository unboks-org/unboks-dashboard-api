import { useQuery } from "@tanstack/react-query";

import {
  fetchCloudConnections,
  type CloudConnectionProvider,
  type CloudConnectionProviderId,
  type CloudConnectionStatus,
} from "@/lib/api";

// Re-export the backend-driven types so existing component imports keep
// working with a single source of truth in `lib/api.ts`.
export type {
  CloudConnectionProvider,
  CloudConnectionProviderId,
  CloudConnectionStatus,
};

/**
 * Backend-driven cloud knowledge connections.
 *
 * Wires the Settings → Connect cloud storage card to
 * `GET /api/{tenant}/dashboard/api/knowledge/cloud-connections` (issue
 * unboks-org/unboks-dashboard-api#29). The backend is the single source
 * of truth: the UI renders ONLY the providers it returns, in the order
 * it returns them. SharePoint and Box are intentionally not part of the
 * product and never appear, even if a stale response includes them
 * (extra defence in `normalizeCloudConnections`).
 *
 * No localStorage shadow state, no fake "connected" flips. The previous
 * pre-backend stub is gone; if the request fails the card surfaces a
 * calm error state instead of pretending nothing is wrong.
 */
export function useCloudKnowledgeConnections() {
  return useQuery({
    queryKey: ["knowledge", "cloud-connections"],
    queryFn: fetchCloudConnections,
    // No staleTime + refetch on focus / mount: when the operator
    // returns from a provider OAuth consent screen, React Query
    // re-runs this query automatically and the status badge flips
    // from "Setup required" to "Connected" without a manual reload.
    // This trades a small amount of extra polling on tab focus for
    // an honest, never-stale connection status.
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
