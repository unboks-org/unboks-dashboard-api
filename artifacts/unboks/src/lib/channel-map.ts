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

// Comprehensive platform alias map — covers all known API variants
const PLATFORM_TO_CHANNEL: Record<string, Channel> = {
  // WhatsApp variants
  whatsapp: "WhatsApp",
  whatsapp_business: "WhatsApp",
  "whatsapp-business": "WhatsApp",
  wa: "WhatsApp",
  wab: "WhatsApp",
  waba: "WhatsApp",
  meta_whatsapp: "WhatsApp",
  "meta-whatsapp": "WhatsApp",
  whatsapp_business_api: "WhatsApp",
  // Email variants
  email: "Email",
  mail: "Email",
  smtp: "Email",
  gmail: "Email",
  outlook: "Email",
  imap: "Email",
  // Instagram variants
  instagram: "Instagram",
  ig: "Instagram",
  instagram_dm: "Instagram",
  "instagram-direct": "Instagram",
  // Facebook variants
  facebook: "Facebook",
  fb: "Facebook",
  messenger_facebook: "Facebook",
  facebook_messenger: "Facebook",
  // Messenger variants
  messenger: "Messenger",
  meta_messenger: "Messenger",
  // X / Twitter variants
  x: "X",
  twitter: "X",
  x_twitter: "X",
  // TikTok variants
  tiktok: "TikTok",
  tik_tok: "TikTok",
};

export function platformToChannel(platform: string | null | undefined): Channel {
  if (typeof platform !== "string" || !platform) return "Email";
  const lower = platform.toLowerCase();
  const mapped = PLATFORM_TO_CHANNEL[lower];
  if (!mapped) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[Unboks] Unknown platform value: "${platform}" — showing as Unknown`);
    }
    return "Unknown";
  }
  return mapped;
}

export function channelToPlatform(channel: Channel): PlatformKey {
  const found = PLATFORMS.find((p) => p.channel === channel);
  return found?.key ?? "email";
}
