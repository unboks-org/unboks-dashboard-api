import { useState } from "react";
import { Conversation } from "@/data/conversations";
import { cn } from "@/lib/utils";
import { CHANNEL_BADGE_COLORS } from "@/lib/channel-map";
import { Star } from "lucide-react";

const AVATAR_COLORS = [
  "#f9a825", "#1a73e8", "#34a853", "#ea4335",
  "#7e57c2", "#ec407a", "#26a69a", "#ff7043",
  "#5c6bc0", "#26c6da", "#9ccc65", "#ab47bc",
];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

interface MessageRowProps {
  conversation: Conversation;
  isSelected?: boolean;
  /** Hide the channel badge — used when the active filter already implies the channel. */
  hideChannel?: boolean;
  onSelect?: (conv: Conversation) => void;
}

export function MessageRow({ conversation, isSelected = false, hideChannel = false, onSelect }: MessageRowProps) {
  const [starred, setStarred] = useState(false);
  const color = avatarColor(conversation.sender);

  // Prefer the latest preview; fall back to subject if preview is missing so
  // the row never collapses to nothing.
  const snippet = conversation.preview?.trim() || conversation.subject?.trim() || "";

  return (
    <div
      onClick={() => onSelect?.(conversation)}
      className={cn(
        "flex items-start gap-3 px-4 py-3 border-b border-[#f1f3f4] transition-colors",
        onSelect ? "cursor-pointer" : "cursor-default",
        isSelected ? "bg-[#e8f0fe]" : "bg-white hover:bg-[#f6f8fc] active:bg-[#eef1f6]",
      )}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[16px] font-medium flex-shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        {initial(conversation.sender)}
      </div>

      <div className="flex-1 min-w-0">
        {/* Line 1: sender (+ optional escalation badge) on the left, time + star on the right */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={cn(
                "truncate text-[14px]",
                conversation.unread ? "font-semibold text-[#202124]" : "font-normal text-[#3c4043]",
              )}
            >
              {conversation.sender}
            </span>
            {conversation.escalated && (
              <span
                className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0",
                  conversation.escalationMode === "soft"
                    ? "bg-[#fef7e0] text-[#a06800]"
                    : conversation.escalationMode === "hard"
                      ? "bg-[#fce8e6] text-[#c5221f]"
                      : "bg-[#f1f3f4] text-[#5f6368]",
                )}
              >
                {conversation.escalationMode === "soft"
                  ? "AI needs help"
                  : conversation.escalationMode === "hard"
                    ? "Human takeover"
                    : "Escalation"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span
              className={cn(
                "text-[12px]",
                conversation.unread ? "text-[#202124] font-medium" : "text-[#5f6368]",
              )}
            >
              {conversation.timestamp}
            </span>
            <button
              aria-label={starred ? "Unstar" : "Star"}
              onClick={(e) => {
                e.stopPropagation();
                setStarred((s) => !s);
              }}
              className="-mr-1 grid h-7 w-7 place-items-center text-[#9aa0a6] transition-colors hover:text-[#202124]"
            >
              <Star
                className={cn("w-4 h-4", starred && "text-[#f9a825]")}
                fill={starred ? "currentColor" : "none"}
                strokeWidth={1.5}
              />
            </button>
          </div>
        </div>

        {/* Line 2: message preview on the left, optional channel pill on the right */}
        <div className="mt-0.5 flex items-center justify-between gap-3 min-w-0">
          <p
            className={cn(
              "truncate text-[13px]",
              conversation.unread ? "text-[#3c4043]" : "text-[#5f6368]",
            )}
          >
            {snippet || <span className="italic text-[#9aa0a6]">No preview</span>}
          </p>
          {!hideChannel && (
            <span
              className="inline-flex items-center gap-1 flex-shrink-0 rounded-full border border-[#e8eaed] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#5f6368]"
              aria-label={`Channel: ${conversation.channel}`}
            >
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: CHANNEL_BADGE_COLORS[conversation.channel] ?? "#9aa0a6" }}
              />
              {conversation.channel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
