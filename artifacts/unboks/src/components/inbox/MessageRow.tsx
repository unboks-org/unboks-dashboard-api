import { useState } from "react";
import { Conversation } from "@/data/conversations";
import { cn } from "@/lib/utils";
import { CHANNEL_BADGE_COLORS } from "@/lib/channel-map";
import { Star, Reply, Forward, Trash2, Archive, ArchiveRestore } from "lucide-react";

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
  /**
   * Email-only persistent row actions. When provided AND the row is an Email
   * conversation, the Reply / Forward / Delete icon trio is rendered next to
   * the timestamp. Each handler stops propagation internally so the row click
   * never fires alongside the action.
   */
  onReply?: (conv: Conversation) => void;
  onForward?: (conv: Conversation) => void;
  onDelete?: (conv: Conversation) => void;
  /**
   * Archive / restore are channel-agnostic. Archive moves the row out of
   * the active inbox (with auto-restore on new inbound). Restore is shown
   * in place of Archive when `archived` is true (Archived view).
   */
  onArchive?: (conv: Conversation) => void;
  onRestore?: (conv: Conversation) => void;
  archived?: boolean;
  /**
   * Muted/history treatment for resolved escalation rows. When true the row
   * renders with dimmed avatar, muted text, and a "Resolved" badge in place
   * of the active escalation mode badge. Archive/restore actions should be
   * omitted at the call site for dimmed rows.
   */
  dimmed?: boolean;
}

export function MessageRow({
  conversation,
  isSelected = false,
  hideChannel = false,
  onSelect,
  onReply,
  onForward,
  onDelete,
  onArchive,
  onRestore,
  archived = false,
  dimmed = false,
}: MessageRowProps) {
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
        isSelected
          ? "bg-[#e8f0fe]"
          : dimmed
            ? "bg-[#fbfbfd] hover:bg-[#f6f8fc]"
            : "bg-white hover:bg-[#f6f8fc] active:bg-[#eef1f6]",
      )}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center text-white text-[16px] font-medium flex-shrink-0",
          dimmed && "opacity-50 grayscale",
        )}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        {initial(conversation.sender)}
      </div>

      <div className="flex-1 min-w-0">
        {/* Line 1: sender name on the left, timestamp + action icons on the right.
            Escalation badges moved to line 2 so they never compete with the
            timestamp or icon strip for horizontal space. */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={cn(
                "truncate text-[14px]",
                dimmed
                  ? "font-normal text-[#9aa0a6]"
                  : conversation.unread
                    ? "font-semibold text-[#202124]"
                    : "font-normal text-[#3c4043]",
              )}
            >
              {conversation.sender}
            </span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <span
              className={cn(
                "text-[12px] mr-1",
                conversation.unread ? "text-[#202124] font-medium" : "text-[#5f6368]",
              )}
            >
              {conversation.timestamp}
            </span>
            {/* Mobile crowding fix:
                Reply / Forward / Delete are duplicated by the detail-
                pane header (which is the natural surface for them on
                touch — you tap the row to open the conversation, then
                act). On mobile we hide them and keep only Archive /
                Restore + Star, which are the two row-level affordances
                an operator actually wants without opening the row. The
                full set returns at sm and up. */}
            {conversation.channel === "Email" && onReply && (
              <button
                type="button"
                aria-label="Reply"
                title="Reply"
                onClick={(e) => {
                  e.stopPropagation();
                  onReply(conversation);
                }}
                className="hidden sm:grid h-10 w-10 sm:h-7 sm:w-7 place-items-center rounded-full text-[#9aa0a6] transition-colors hover:bg-[#e8f0fe] hover:text-[#1a73e8]"
              >
                <Reply className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
            {conversation.channel === "Email" && onForward && (
              <button
                type="button"
                aria-label="Forward"
                title="Forward"
                onClick={(e) => {
                  e.stopPropagation();
                  onForward(conversation);
                }}
                className="hidden sm:grid h-10 w-10 sm:h-7 sm:w-7 place-items-center rounded-full text-[#9aa0a6] transition-colors hover:bg-[#e8f0fe] hover:text-[#1a73e8]"
              >
                <Forward className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
            {conversation.channel === "Email" && onDelete && !archived && (
              <button
                type="button"
                aria-label="Delete"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conversation);
                }}
                className="hidden sm:grid h-10 w-10 sm:h-7 sm:w-7 place-items-center rounded-full text-[#9aa0a6] transition-colors hover:bg-[#fce8e6] hover:text-[#c5221f]"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
            {!archived && onArchive && (
              <button
                type="button"
                aria-label="Archive"
                title="Archive"
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(conversation);
                }}
                className="grid h-10 w-10 sm:h-7 sm:w-7 place-items-center rounded-full text-[#9aa0a6] transition-colors hover:bg-[#eef1f6] hover:text-[#1f2937]"
              >
                <Archive className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
            {archived && onRestore && (
              <button
                type="button"
                aria-label="Restore to inbox"
                title="Restore to inbox"
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore(conversation);
                }}
                className="grid h-10 w-10 sm:h-7 sm:w-7 place-items-center rounded-full text-[#9aa0a6] transition-colors hover:bg-[#e8f0fe] hover:text-[#1a73e8]"
              >
                <ArchiveRestore className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
            <button
              type="button"
              aria-label={starred ? "Unstar" : "Star"}
              title={starred ? "Unstar" : "Star"}
              onClick={(e) => {
                e.stopPropagation();
                setStarred((s) => !s);
              }}
              className="-mr-1 grid h-10 w-10 sm:h-7 sm:w-7 place-items-center rounded-full text-[#9aa0a6] transition-colors hover:text-[#202124]"
            >
              <Star
                className={cn("w-4 h-4", starred && "text-[#f9a825]")}
                fill={starred ? "currentColor" : "none"}
                strokeWidth={1.5}
              />
            </button>
          </div>
        </div>

        {/* Line 2: escalation/resolved badge (when present) + preview on the
            left, optional channel pill on the right. Badges live here so they
            never collide with the timestamp or action icons on line 1. */}
        <div className="mt-0.5 flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {dimmed ? (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 bg-[#e6f4ea] text-[#137333]">
                Resolved
              </span>
            ) : conversation.escalated ? (
              <span
                className={cn(
                  "text-[11px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0",
                  conversation.escalationMode === "soft"
                    ? "bg-[#fef7e0] text-[#a06800]"
                    : conversation.escalationMode === "hard"
                      ? "bg-[#fce8e6] text-[#c5221f]"
                      : "bg-[#f1f3f4] text-[#5f6368]",
                )}
              >
                {conversation.escalationMode === "soft"
                  ? "Agent needs help"
                  : conversation.escalationMode === "hard"
                    ? "Human takeover"
                    : "Escalation"}
              </span>
            ) : null}
            <p
              className={cn(
                "truncate text-[13px]",
                dimmed ? "text-[#9aa0a6]" : conversation.unread ? "text-[#3c4043]" : "text-[#5f6368]",
              )}
            >
              {snippet || <span className="italic text-[#9aa0a6]">No preview</span>}
            </p>
          </div>
          {!hideChannel && (
            <span
              className="inline-flex items-center gap-1 flex-shrink-0 rounded-full border border-[#e8eaed] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[#5f6368]"
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
