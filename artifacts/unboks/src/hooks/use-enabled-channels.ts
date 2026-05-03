import { useState, useCallback, useEffect } from "react";
import type { Channel } from "@/data/conversations";

export type ToggledChannel = Exclude<Channel, "All" | "Messenger">;

export const TOGGLEABLE_CHANNELS: ToggledChannel[] = [
  "WhatsApp",
  "Instagram",
  "Facebook",
  "Email",
  "X",
  "TikTok",
];

const DEFAULT_ENABLED: ToggledChannel[] = ["WhatsApp", "Instagram", "Facebook", "Email"];
const STORAGE_KEY = "unboks_enabled_channels";
const EVENT_NAME = "unboks_enabled_channels_changed";

function readFromStorage(): ToggledChannel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ENABLED;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_ENABLED;
    return parsed.filter((c): c is ToggledChannel =>
      TOGGLEABLE_CHANNELS.includes(c as ToggledChannel)
    );
  } catch {
    return DEFAULT_ENABLED;
  }
}

function writeToStorage(channels: ToggledChannel[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(channels));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // ignore
  }
}

export function useEnabledChannels() {
  const [enabledChannels, setEnabledChannelsState] = useState<ToggledChannel[]>(readFromStorage);

  // Re-sync from storage on storage event (cross-tab) or our custom event (same-tab)
  useEffect(() => {
    const sync = () => setEnabledChannelsState(readFromStorage());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const setEnabledChannels = useCallback((channels: ToggledChannel[]) => {
    setEnabledChannelsState(channels);
    writeToStorage(channels);
  }, []);

  const toggleChannel = useCallback((channel: ToggledChannel) => {
    setEnabledChannelsState((prev) => {
      const next = prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel];
      writeToStorage(next);
      return next;
    });
  }, []);

  const isChannelEnabled = useCallback(
    (channel: Channel) => {
      if (channel === "All" || channel === "Messenger") return true;
      return enabledChannels.includes(channel as ToggledChannel);
    },
    [enabledChannels]
  );

  return { enabledChannels, isChannelEnabled, toggleChannel, setEnabledChannels };
}
