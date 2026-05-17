/**
 * use-icp-channel-visibility
 *
 * THE ONLY source of channel visibility in Nr 2.
 *
 * - Reads ICP feature_toggles via use-icp-overrides (which proxies
 *   wtyj-agent /dashboard/api/icp-overrides).
 * - A channel is visible IFF feature_toggles[key].value === true.
 *   false, null, undefined, missing, or bridge unreachable -> hidden.
 * - No localStorage. No fallbacks. No "remember what you had". The
 *   ICP envelope is the entire input.
 *
 * ICP key -> Nr 2 channel mapping. instagram_facebook is one toggle
 * that controls all three Meta surfaces (owner's spec). X has no ICP
 * key and stays hidden until an `x_dms` key exists in ICP.
 */
import { useCallback, useMemo } from "react";
import type { Channel } from "@/data/conversations";
import { useIcpOverrides, type IcpEnvelope } from "./use-icp-overrides";

export type VisibleChannel = Exclude<Channel, "All" | "Unknown">;

export const ALL_TOGGLEABLE_CHANNELS: VisibleChannel[] = [
  "WhatsApp",
  "Instagram",
  "Facebook",
  "Messenger",
  "Email",
  "X",
  "TikTok",
];

const ICP_KEY_TO_CHANNELS: Record<string, VisibleChannel[]> = {
  whatsapp_inbox: ["WhatsApp"],
  email_inbox: ["Email"],
  instagram_facebook: ["Instagram", "Facebook", "Messenger"],
  tiktok_dms: ["TikTok"],
};

function visibleFromEnvelope(envelope?: IcpEnvelope): VisibleChannel[] {
  if (!envelope || !envelope.feature_toggles) return [];
  const visible = new Set<VisibleChannel>();
  for (const [key, channels] of Object.entries(ICP_KEY_TO_CHANNELS)) {
    const toggle = envelope.feature_toggles[key];
    if (toggle && toggle.value === true) {
      channels.forEach((c) => visible.add(c));
    }
  }
  return Array.from(visible);
}

export function useIcpChannelVisibility() {
  const query = useIcpOverrides();
  const visibleChannels = useMemo(
    () => visibleFromEnvelope(query.data),
    [query.data]
  );

  const isChannelVisible = useCallback(
    (channel: Channel) => {
      // "All" and "Unknown" are inbox meta-filters, not real channels.
      if (channel === "All" || channel === "Unknown") return true;
      return visibleChannels.includes(channel as VisibleChannel);
    },
    [visibleChannels]
  );

  return {
    visibleChannels,
    isChannelVisible,
    isLoading: query.isLoading,
    isIcpAvailable: !!query.data?.available,
  };
}
