import type { Channel } from "@/data/conversations";

export type PlatformKey =
  | "whatsapp"
  | "email"
  | "instagram"
  | "facebook"
  | "x"
  | "twitter"
  | "tiktok"
  | "telegram"
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
  { key: "telegram", label: "Telegram", channel: "Telegram" },
  { key: "messenger", label: "Messenger", channel: "Messenger" },
];

// =============================================================
//  RULE: NEVER BUNDLE CHANNELS  (owner decision, 2026-05-17)
//  Every channel is always separate. messenger MUST route to
//  "Messenger" — never to "Facebook". Same for every other
//  channel. No "Meta unification". No shared keys. No collapsing
//  any two channels into one. If you are about to write
//  `messenger: "Facebook"` or anything analogous, stop and ask
//  Calvin first. This has been re-broken twice already.
// =============================================================
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
  // Telegram variants
  telegram: "Telegram",
  telegram_bot: "Telegram",
  tg: "Telegram",
  // Messenger variants — separate channel (no Meta unification)
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
  if (typeof platform !== "string" || !platform.trim()) return "Unknown";
  const normalized = platform.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const mapped = PLATFORM_TO_CHANNEL[normalized];
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

/** Shared brand colors for channel badges (rows, headers, drawer). */
export const CHANNEL_BADGE_COLORS: Record<Channel, string> = {
  All: "#5f6368",
  WhatsApp: "#25d366",
  Email: "#1a73e8",
  Instagram: "#c13584",
  Facebook: "#1877f2",
  X: "#202124",
  TikTok: "#010101",
  Telegram: "#0088cc",
  Messenger: "#0084ff",
  Unknown: "#9aa0a6",
};
