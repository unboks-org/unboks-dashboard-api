import { useCallback, useMemo } from "react";
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

const ICP_KEY_TO_CHANNEL: Record<string, VisibleChannel> = {
  whatsapp_inbox: "WhatsApp",
  email_inbox: "Email",
  instagram_dms: "Instagram",
  facebook_dms: "Facebook",
  telegram_alerts: "Telegram",
  tiktok_dms: "TikTok",
  x_dms: "X",
};

function visibleFromEnvelope(envelope?: IcpEnvelope): VisibleChannel[] {
  if (!envelope || !envelope.feature_toggles) return [];
  const visible: VisibleChannel[] = [];
  for (const [key, channel] of Object.entries(ICP_KEY_TO_CHANNEL)) {
    const toggle = envelope.feature_toggles[key];
    if (toggle && toggle.value === true) visible.push(channel);
  }
  return visible;
}

export function useIcpChannelVisibility() {
  const query = useIcpOverrides();
  const visibleChannels = useMemo(
    () => visibleFromEnvelope(query.data),
    [query.data]
  );

  const isChannelVisible = useCallback(
    (channel: Channel) => {
      if (channel === "All" || channel === "Unknown") return true;
      return (visibleChannels as readonly string[]).includes(channel);
    },
    [visibleChannels]
  );

  return { visibleChannels, isChannelVisible };
}
