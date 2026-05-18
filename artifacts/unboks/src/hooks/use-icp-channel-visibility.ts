// =============================================================
//  RULE: NEVER BUNDLE CHANNELS  (owner decision, 2026-05-17)
//  Eight channels (WhatsApp, Email, Instagram, Facebook, Messenger,
//  Telegram, TikTok, X). Each is a separate visibility unit driven
//  by its own ICP feature_toggle key. Do NOT collapse Messenger
//  into Facebook, do NOT introduce a shared toggle that controls
//  more than one channel, do NOT remove a channel from the union.
//  If a new channel is added it joins this list as a new entry.
// =============================================================
import { useCallback, useMemo } from "react";
import type { Channel } from "@/data/conversations";
import { useIcpOverrides, type IcpEnvelope } from "./use-icp-overrides";

export type VisibleChannel =
  | "WhatsApp"
  | "Email"
  | "Instagram"
  | "Facebook"
  | "Messenger"
  | "Telegram"
  | "TikTok"
  | "X";

// Channel name is the strict prefix. To stay tolerant of small backend
// suffix differences (_inbox / _dms / _dm / _messages / _alerts /
// _chat) without inviting cross-channel false positives, we accept any
// key whose lower-cased form starts with the channel prefix followed by
// "_". The bare prefix on its own is intentionally NOT accepted — that
// was the source of the previous WhatsApp false-positive where a
// generic "whatsapp" connection-state key bled into visibility.
const CHANNEL_PREFIXES: Record<VisibleChannel, readonly string[]> = {
  WhatsApp: ["whatsapp"],
  Email: ["email"],
  Instagram: ["instagram"],
  Facebook: ["facebook"],
  Messenger: ["messenger"],
  Telegram: ["telegram"],
  TikTok: ["tiktok"],
  X: ["x", "twitter"],
};

const ALLOWED_SUFFIXES = [
  "inbox",
  "dms",
  "dm",
  "messages",
  "alerts",
  "chat",
];

function keyMatchesChannel(key: string, prefixes: readonly string[]): boolean {
  const lower = key.toLowerCase();
  for (const prefix of prefixes) {
    if (!lower.startsWith(`${prefix}_`)) continue;
    const suffix = lower.slice(prefix.length + 1);
    if (ALLOWED_SUFFIXES.includes(suffix)) return true;
  }
  return false;
}

// A toggle is ON only if its value parses as strictly true. Canonical
// shape is `{ value: true }`; we also accept a bare `true` for backends
// that flatten. Anything else (null, false, missing, etc) is OFF.
function toggleIsOn(raw: unknown): boolean {
  if (raw === true) return true;
  if (!raw || typeof raw !== "object") return false;
  return (raw as { value?: unknown }).value === true;
}

function classifyToggles(envelope?: IcpEnvelope) {
  const toggles =
    (envelope?.feature_toggles && typeof envelope.feature_toggles === "object"
      ? (envelope.feature_toggles as Record<string, unknown>)
      : {}) as Record<string, unknown>;
  const visible: VisibleChannel[] = [];
  const matchedKeys: Record<VisibleChannel, string[]> = {
    WhatsApp: [],
    Email: [],
    Instagram: [],
    Facebook: [],
    Messenger: [],
    Telegram: [],
    TikTok: [],
    X: [],
  };
  const truthyKeys: string[] = [];
  const unmatchedTruthyKeys: string[] = [];

  for (const [key, raw] of Object.entries(toggles)) {
    if (!toggleIsOn(raw)) continue;
    truthyKeys.push(key);
    let matched = false;
    for (const [channel, prefixes] of Object.entries(CHANNEL_PREFIXES) as [
      VisibleChannel,
      readonly string[],
    ][]) {
      if (keyMatchesChannel(key, prefixes)) {
        matched = true;
        matchedKeys[channel].push(key);
        if (!visible.includes(channel)) visible.push(channel);
      }
    }
    if (!matched) unmatchedTruthyKeys.push(key);
  }

  // Preserve canonical order (WhatsApp → X) in the sidebar.
  const canonicalOrder: VisibleChannel[] = [
    "WhatsApp",
    "Email",
    "Instagram",
    "Facebook",
    "Messenger",
    "Telegram",
    "TikTok",
    "X",
  ];
  const visibleOrdered = canonicalOrder.filter((c) => visible.includes(c));

  return { visible: visibleOrdered, matchedKeys, truthyKeys, unmatchedTruthyKeys };
}

export function useIcpChannelVisibility() {
  const query = useIcpOverrides();

  const visibleChannels = useMemo(
    () => classifyToggles(query.data).visible,
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
