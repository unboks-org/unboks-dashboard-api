import type { Channel } from "@/data/conversations";

export type PlatformKey =
  | "whatsapp"
  | "email"
  | "instagram"
  | "facebook"
  | "x"
  | "twitter"
  | "tiktok"
  | "messenger";

export interface PlatformDef {
  key: PlatformKey;
  label: string;
  channel: Channel;
}

export const PLATFORMS: PlatformDef[] = [
  { key: "whatsapp", label: "WhatsApp", channel: "WhatsApp" },
  { key: "email", label: "Email", channel: "Email" },
  { key: "instagram", label: "Instagram", channel: "Instagram" },
  { key: "facebook", label: "Facebook", channel: "Facebook" },
  { key: "x", label: "X", channel: "X" },
  { key: "twitter", label: "X", channel: "X" },
  { key: "tiktok", label: "TikTok", channel: "TikTok" },
  { key: "messenger", label: "Messenger", channel: "Messenger" },
];

const PLATFORM_TO_CHANNEL: Record<string, Channel> = Object.fromEntries(
  PLATFORMS.map((p) => [p.key, p.channel]),
);

export function platformToChannel(platform: string): Channel {
  return PLATFORM_TO_CHANNEL[platform.toLowerCase()] ?? "Email";
}

export function channelToPlatform(channel: Channel): PlatformKey {
  const found = PLATFORMS.find((p) => p.channel === channel);
  return found?.key ?? "email";
}
