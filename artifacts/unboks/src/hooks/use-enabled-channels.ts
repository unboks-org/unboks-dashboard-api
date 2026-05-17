/**
 * use-enabled-channels
 *
 * Channel visibility for the inbox sidebar / filters.
 *
 * SOURCE OF TRUTH: Nr 3 (ICP) feature toggles, fetched via the
 * wtyj-agent /dashboard/api/icp-overrides bridge in use-icp-overrides.
 * ICP toggle value === true means the channel is visible; anything
 * else (false, null, missing, or bridge unreachable) means hidden.
 *
 * Local storage and Settings-page checkboxes used to control this
 * client-side. Those paths are gone — toggleChannel and
 * setEnabledChannels are kept as no-op shims (with a dev-only warn)
 * so existing call sites compile. The Settings page now renders a
 * read-only display with a "managed by ICP" note.
 *
 * ICP key -> Nr 2 channel mapping (one ICP key may map to multiple
 * channels; instagram_facebook covers all three Meta surfaces):
 *
 *   whatsapp_inbox     -> ["WhatsApp"]
 *   email_inbox        -> ["Email"]
 *   instagram_facebook -> ["Instagram", "Facebook", "Messenger"]
 *   tiktok_dms         -> ["TikTok"]
 *
 * Channels with no ICP key (currently "X") stay hidden. Add a
 * matching ICP feature_toggle key to make them controllable.
 */
import { useCallback, useMemo } from "react";
import type { Channel } from "@/data/conversations";
import { useIcpOverrides, type IcpEnvelope } from "./use-icp-overrides";

export type ToggledChannel = Exclude<Channel, "All" | "Unknown">;

export const TOGGLEABLE_CHANNELS: ToggledChannel[] = [
  "WhatsApp",
  "Instagram",
  "Facebook",
  "Messenger",
  "Email",
  "X",
  "TikTok",
];

const ICP_KEY_TO_CHANNELS: Record<string, ToggledChannel[]> = {
  whatsapp_inbox: ["WhatsApp"],
  email_inbox: ["Email"],
  instagram_facebook: ["Instagram", "Facebook", "Messenger"],
  tiktok_dms: ["TikTok"],
};

const LEGACY_STORAGE_KEY = "unboks_enabled_channels";
// One-shot cleanup: ditch any stale local override the moment this
// new hook runs in the browser. Quietly does nothing in SSR / tests.
try {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
} catch {
  // ignore
}

function enabledFromEnvelope(envelope?: IcpEnvelope): ToggledChannel[] {
  if (!envelope || !envelope.feature_toggles) return [];
  const enabled = new Set<ToggledChannel>();
  for (const [icpKey, channels] of Object.entries(ICP_KEY_TO_CHANNELS)) {
    const toggle = envelope.feature_toggles[icpKey];
    if (toggle && toggle.value === true) {
      channels.forEach((c) => enabled.add(c));
    }
  }
  return Array.from(enabled);
}

export function useEnabledChannels() {
  const query = useIcpOverrides();
  const enabledChannels = useMemo(
    () => enabledFromEnvelope(query.data),
    [query.data]
  );

  const isChannelEnabled = useCallback(
    (channel: Channel) => {
      // "All" and "Unknown" filters always pass through — they are
      // meta-filters in the inbox, not real channels.
      if (channel === "All" || channel === "Unknown") return true;
      return enabledChannels.includes(channel as ToggledChannel);
    },
    [enabledChannels]
  );

  // The two mutators are now no-ops. Existing call sites
  // (Settings.tsx, Drawer.tsx, Inbox.tsx) continue to compile; the
  // dev-only warn surfaces accidental uses so we can rip the call
  // site instead of letting it silently fail.
  const toggleChannel = useCallback((channel: ToggledChannel) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        `[use-enabled-channels] toggleChannel(${channel}) ignored. ` +
          "Channel visibility is controlled by ICP — flip the toggle " +
          "in icp.unboks.org > tenant workspace > Channels."
      );
    }
  }, []);

  const setEnabledChannels = useCallback((_: ToggledChannel[]) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        "[use-enabled-channels] setEnabledChannels(...) ignored. " +
          "Channel visibility is controlled by ICP."
      );
    }
  }, []);

  return {
    enabledChannels,
    isChannelEnabled,
    toggleChannel,
    setEnabledChannels,
    isLoading: query.isLoading,
    isIcpAvailable: !!query.data?.available,
  };
}
