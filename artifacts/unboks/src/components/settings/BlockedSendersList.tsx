import { Ban, Loader2 } from "lucide-react";
import { useBlockedSenders, useUnblockMutation } from "@/hooks/use-blocked-senders";
import { BLOCK_REASONS, type BlockReason } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const REASON_LABELS: Record<string, string> = Object.fromEntries(
  BLOCK_REASONS.map((r) => [r.value, r.label]),
);

function reasonLabel(raw: string): string {
  return REASON_LABELS[raw] ?? raw;
}

function formatChannel(channel: string): string {
  if (!channel) return "Unknown";
  const lower = channel.toLowerCase();
  switch (lower) {
    case "whatsapp": return "WhatsApp";
    case "email": return "Email";
    case "instagram": return "Instagram";
    case "facebook": return "Facebook";
    case "messenger": return "Facebook";
    case "tiktok": return "TikTok";
    case "x": return "X";
    default: return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
}

function formatUpdatedAt(iso: string): string {
  // ASCII hyphen for the "no value" placeholder per the brand rule
  // (no em-dashes anywhere in user-visible copy).
  if (!iso) return "-";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return new Date(ms).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Settings card: "Blocked senders" (R2-30).
 *
 * Lists every conversation/contact the operator has blocked at the
 * Unboks dashboard layer. Each row carries the channel, the picked
 * reason, who blocked it, and when. The Unblock button reopens the
 * sender immediately — future inbound starts flowing into the active
 * inbox again. Historical messages are preserved on either side of
 * a block/unblock cycle (the backend never deletes anything).
 */
export function BlockedSendersList() {
  const { data, isLoading, isError, error } = useBlockedSenders();
  const unblock = useUnblockMutation();
  const blocked = data?.conversations ?? [];

  const handleUnblock = async (conversationId: string) => {
    try {
      await unblock.mutateAsync(conversationId);
      toast.success("Unblocked", {
        description: "Future messages from this sender will appear in the active inbox.",
      });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message || `Backend returned ${err.status}.`
          : err instanceof Error
            ? err.message
            : "Couldn't unblock. Please try again.";
      toast.error("Couldn't unblock", { description: msg });
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white">
      <div className="border-b border-[#f1f3f4] px-5 py-4 sm:px-6">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-[#202124]">
          <Ban className="h-4 w-4 text-[#5f6368]" aria-hidden="true" />
          Blocked senders
        </h3>
        <p className="mt-1 text-[13px] text-[#5f6368]">
          Senders blocked at the Unboks dashboard layer. Future messages from these contacts do not appear in the active inbox, the Agent does not reply, and escalation alerts are not triggered. This does not block contacts inside WhatsApp itself.
        </p>
      </div>

      <div className="px-5 py-4 sm:px-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-[#5f6368]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading blocked senders…
          </div>
        ) : isError ? (
          <p className="text-[13px] text-[#c5221f]">
            {error instanceof Error && error.message
              ? `Couldn't load blocked senders: ${error.message}`
              : "Couldn't load blocked senders."}
          </p>
        ) : blocked.length === 0 ? (
          <p className="text-[13px] text-[#5f6368]">
            No senders are blocked yet. Use the Block in Unboks action on any conversation to add one here.
          </p>
        ) : (
          <ul className="divide-y divide-[#f1f3f4]">
            {blocked.map((row) => {
              const isUnblocking =
                unblock.isPending && unblock.variables === row.conversationId;
              return (
                <li
                  key={row.conversationId}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[13px] font-medium text-[#1f2937] break-words"
                      title={row.conversationId}
                    >
                      {row.conversationId}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[#5f6368]">
                      <span>{formatChannel(row.channel)}</span>
                      <span>Reason: {reasonLabel(row.reason as BlockReason)}</span>
                      {row.blockedBy && <span>Blocked by {row.blockedBy}</span>}
                      <span>Updated {formatUpdatedAt(row.updatedAt)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnblock(row.conversationId)}
                    disabled={isUnblocking}
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#dadce0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1f2937] transition-colors",
                      "hover:border-[#1a73e8] hover:text-[#1a73e8]",
                      "focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30",
                      "disabled:opacity-60 disabled:cursor-not-allowed",
                    )}
                  >
                    {isUnblocking ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : null}
                    {isUnblocking ? "Unblocking…" : "Unblock"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
