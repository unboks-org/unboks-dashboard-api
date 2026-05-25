/**
 * use-icp-overrides
 *
 * React Query hook for the wtyj-agent dashboard endpoint
 *   GET /api/{slug}/dashboard/api/icp-overrides
 *
 * That endpoint proxies the Nr 3 (ICP) effective-state envelope —
 * the SINGLE SOURCE OF TRUTH for per-tenant feature toggles and
 * channel visibility. The React frontend never talks to ICP
 * directly; everything goes through wtyj-agent so the bridge token
 * stays server-side.
 *
 * Envelope shape (from app.effective_state.get_effective_tenant_state
 * via app.routes.internal_api.read_tenant_overrides):
 *
 *   {
 *     available: boolean,         // false = bridge unreachable
 *     reason?: string,
 *     tenant_id: string | null,
 *     feature_toggles: {
 *       [feature_key: string]: {
 *         value: boolean | null,
 *         source: "backend" | "icp_override" | "unknown",
 *         wired: boolean,
 *         updated_at: string | null,
 *         updated_by: string | null,
 *       }
 *     },
 *     display_metadata?: object,
 *     sot_entries?: unknown[],
 *     ai_agent_settings?: object,
 *   }
 *
 * Caching:
 *   - React Query staleTime: 15s
 *   - refetchOnWindowFocus: true so flipping a toggle in ICP and
 *     switching tabs back to Nr 2 refreshes immediately
 *   - foreground poll every 15s so an active Nr 2 tab picks up
 *     override changes without hidden-tab background load
 *
 * Failure behavior:
 *   - Network error, 401/403/404/5xx, non-JSON body, or
 *     bridge-unreachable response → returns EMPTY envelope
 *     (available: false). Callers MUST treat this as "no overrides
 *     active" — consistent with the wtyj-agent backend semantics.
 */
import { useQuery } from "@tanstack/react-query";
import { getApiBase, getClientSlug, getToken } from "@/lib/tenant";

export interface IcpFeatureToggle {
  value: boolean | null;
  source: "backend" | "icp_override" | "unknown";
  wired: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export interface IcpEnvelope {
  available: boolean;
  reason?: string;
  tenant_id: string | null;
  feature_toggles: Record<string, IcpFeatureToggle>;
  display_metadata?: Record<string, unknown>;
  sot_entries?: unknown[];
  ai_agent_settings?: Record<string, unknown>;
}

const EMPTY_ENVELOPE: IcpEnvelope = {
  available: false,
  tenant_id: null,
  feature_toggles: {},
};

const ICP_OVERRIDE_STALE_MS = 15_000;
const ICP_OVERRIDE_POLL_MS = 15_000;

async function fetchIcpEnvelope(): Promise<IcpEnvelope> {
  const slug = getClientSlug();
  const token = getToken();
  if (!slug || !token) return EMPTY_ENVELOPE;
  // Use getApiBase() so the request respects VITE_API_BASE_URL in
  // production. A relative /api/... URL would hit the dashboard origin,
  // not the API host, and silently return an empty envelope.
  const url = `${getApiBase(slug)}/icp-overrides`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
  } catch {
    return EMPTY_ENVELOPE;
  }
  if (!resp.ok) return EMPTY_ENVELOPE;
  let body: IcpEnvelope | undefined;
  try {
    body = (await resp.json()) as IcpEnvelope | undefined;
  } catch {
    return EMPTY_ENVELOPE;
  }
  if (!body || typeof body !== "object") return EMPTY_ENVELOPE;
  const envelope: IcpEnvelope = {
    available: body.available !== false,
    reason: body.reason,
    tenant_id: body.tenant_id ?? null,
    feature_toggles:
      (body.feature_toggles && typeof body.feature_toggles === "object"
        ? body.feature_toggles
        : {}) as Record<string, IcpFeatureToggle>,
    display_metadata: body.display_metadata,
    sot_entries: body.sot_entries,
    ai_agent_settings: body.ai_agent_settings,
  };
  return envelope;
}

export function useIcpOverrides() {
  return useQuery({
    queryKey: ["icp-overrides", getClientSlug()],
    queryFn: fetchIcpEnvelope,
    // Keep active tabs reasonably fresh without hammering ICP from
    // every open dashboard tab. Focus/reconnect handles the common
    // operator path of toggling in Nr3 and returning to Nr2.
    staleTime: ICP_OVERRIDE_STALE_MS,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchInterval: ICP_OVERRIDE_POLL_MS,
    refetchIntervalInBackground: false,
  });
}
