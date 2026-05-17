import { useCallback, useEffect, useMemo } from "react";
import type { Channel } from "@/data/conversations";
import { useIcpOverrides, type IcpEnvelope } from "./use-icp-overrides";

export type VisibleChannel =
  | "WhatsApp"
  | "Email"
  | "Instagram"
  | "Facebook"
  | "Telegram"
  | "TikTok"
  | "X";

// Strict per-channel ICP key — no synonyms. ICP is the single source
// of truth and these are the exact keys the brief specifies.
const ICP_KEY_TO_CHANNEL: Record<string, VisibleChannel> = {
  whatsapp_inbox: "WhatsApp",
  email_inbox: "Email",
  instagram_dms: "Instagram",
  facebook_dms: "Facebook",
  telegram_alerts: "Telegram",
  tiktok_dms: "TikTok",
  x_dms: "X",
};

// A toggle is ON only if its value is strictly true. We accept the
// canonical shape `{ value: true }` from the wtyj-agent bridge and a
// bare `true` for the rare case the backend flattens. Anything else
// (null, false, missing, {value:null}, {value:false}) is OFF.
function toggleIsOn(raw: unknown): boolean {
  if (raw === true) return true;
  if (!raw || typeof raw !== "object") return false;
  return (raw as { value?: unknown }).value === true;
}

function visibleFromEnvelope(envelope?: IcpEnvelope): VisibleChannel[] {
  if (!envelope) return [];
  const toggles =
    (envelope.feature_toggles && typeof envelope.feature_toggles === "object"
      ? (envelope.feature_toggles as Record<string, unknown>)
      : {}) as Record<string, unknown>;
  const visible: VisibleChannel[] = [];
  for (const [key, channel] of Object.entries(ICP_KEY_TO_CHANNEL)) {
    if (toggleIsOn(toggles[key])) visible.push(channel);
  }
  return visible;
}

export function useIcpChannelVisibility() {
  const query = useIcpOverrides();
  const visibleChannels = useMemo(
    () => visibleFromEnvelope(query.data),
    [query.data]
  );

  // Always-on diagnostic so a hard refresh + open console shows the
  // exact envelope keys/values vs the computed visible list. This is
  // the fastest way to spot a backend key mismatch.
  useEffect(() => {
    if (!query.data) return;
    // eslint-disable-next-line no-console
    console.log(
      "[ICP] visibility",
      {
        available: query.data.available,
        tenant_id: query.data.tenant_id,
        feature_toggles: query.data.feature_toggles,
        visibleChannels,
      },
    );
  }, [query.data, visibleChannels]);

  const isChannelVisible = useCallback(
    (channel: Channel) => {
      if (channel === "All" || channel === "Unknown") return true;
      return (visibleChannels as readonly string[]).includes(channel);
    },
    [visibleChannels]
  );

  return { visibleChannels, isChannelVisible };
}
