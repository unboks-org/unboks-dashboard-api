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

// Each channel has one canonical ICP key plus a small set of synonyms.
// The canonical key is what the brief specifies; synonyms exist because
// real backend payloads sometimes use the bare platform name. If the
// backend exposes ANY of these keys as truthy for a channel, that
// channel is visible.
const CHANNEL_KEYS: Record<VisibleChannel, readonly string[]> = {
  WhatsApp: ["whatsapp_inbox", "whatsapp"],
  Email: ["email_inbox", "email"],
  Instagram: ["instagram_dms", "instagram"],
  Facebook: ["facebook_dms", "facebook"],
  Telegram: ["telegram_alerts", "telegram"],
  TikTok: ["tiktok_dms", "tiktok"],
  X: ["x_dms", "x", "twitter"],
};

// Accept any reasonable shape the backend might return for a single
// toggle: bare boolean, { value }, { enabled }, { effective_value },
// { override }. Everything else (null, undefined, false, missing) is OFF.
function toggleIsOn(raw: unknown): boolean {
  if (raw === true) return true;
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  return (
    obj.value === true ||
    obj.enabled === true ||
    obj.effective_value === true ||
    obj.override === true
  );
}

function visibleFromEnvelope(envelope?: IcpEnvelope): VisibleChannel[] {
  if (!envelope) return [];
  const toggles =
    (envelope.feature_toggles && typeof envelope.feature_toggles === "object"
      ? (envelope.feature_toggles as Record<string, unknown>)
      : {}) as Record<string, unknown>;
  const visible: VisibleChannel[] = [];
  for (const [channel, keys] of Object.entries(CHANNEL_KEYS) as [
    VisibleChannel,
    readonly string[],
  ][]) {
    const on = keys.some((key) => toggleIsOn(toggles[key]));
    if (on) visible.push(channel);
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
