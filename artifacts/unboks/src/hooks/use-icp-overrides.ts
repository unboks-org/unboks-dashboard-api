import { useQuery } from "@tanstack/react-query";
import { getApiBase, getCurrentSlug, getToken } from "@/lib/tenant";

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

async function fetchIcpEnvelope(): Promise<IcpEnvelope> {
  const slug = getCurrentSlug();
  const token = getToken();
  if (!slug || !token) return EMPTY_ENVELOPE;

  const url = `${getApiBase(slug)}/icp-overrides?_=${Date.now()}`;
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
    feature_toggles: (body.feature_toggles && typeof body.feature_toggles === "object"
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
    queryKey: ["icp-overrides", getCurrentSlug()],
    queryFn: fetchIcpEnvelope,
    staleTime: 0,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
  });
}
