import { useState } from "react";
import { Conversation } from "@/data/conversations";
import { cn } from "@/lib/utils";
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
  onSelect?: (conv: Conversation) => void;
}

export function MessageRow({ conversation, isSelected = false, onSelect }: MessageRowProps) {
  const [starred, setStarred] = useState(false);
  const color = avatarColor(conversation.sender);

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
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-[15px] text-[#202124]",
              conversation.unread ? "font-semibold" : "font-normal"
            )}
          >
            {conversation.sender}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {conversation.escalated && (
              <span
                className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap",
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
            <span
              className={cn(
                "text-[12px]",
                conversation.unread ? "text-[#202124] font-medium" : "text-[#5f6368]"
              )}
            >
              {conversation.timestamp}
            </span>
          </div>
        </div>

        <div
          className={cn(
            "truncate text-[14px] mt-0.5",
            conversation.unread ? "font-semibold text-[#202124]" : "font-normal text-[#5f6368]"
          )}
        >
          {conversation.subject}
        </div>

        <div className="truncate text-[13px] text-[#5f6368] mt-0.5">
          {conversation.preview}
        </div>
      </div>

      <button
        aria-label={starred ? "Unstar" : "Star"}
        onClick={(e) => {
          e.stopPropagation();
          setStarred((s) => !s);
        }}
        className="flex-shrink-0 w-8 h-8 -mr-1 flex items-center justify-center text-[#5f6368] hover:text-[#202124] transition-colors"
      >
        <Star
          className={cn("w-5 h-5", starred && "text-[#f9a825]")}
          fill={starred ? "currentColor" : "none"}
          strokeWidth={1.5}
        />
      </button>
    </div>
  );
}
