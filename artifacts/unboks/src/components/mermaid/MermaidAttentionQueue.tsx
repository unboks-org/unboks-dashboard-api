import { useState } from "react";
import { ChevronDown, MessageCircleMore, UserRoundCheck } from "lucide-react";
import { useConversation } from "@/hooks/use-client-api";
import { useMermaidAttention } from "@/hooks/use-mermaid-attention";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MermaidEscalationActions } from "./MermaidEscalationActions";
import {
  attentionGuestMessage,
  type MermaidAttentionCase,
} from "@/lib/mermaid-attention";
import {
  formatMermaidActivity,
  formatMermaidTripDate,
  mermaidConversationHref,
} from "@/lib/mermaid-operations";

export function MermaidAttentionCaseCard({
  item,
  initiallyOpen = false,
}: {
  item: MermaidAttentionCase;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const recordedMessage = item.issues[0]?.customerMessage;
  const detail = useConversation(recordedMessage ? null : item.conversationId);
  const context = attentionGuestMessage(
    detail.data?.messages ?? [],
    item.issues[0]?.createdAt ?? item.createdAt,
  );
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="min-w-0 rounded-2xl border border-rose-200 bg-white [overflow-wrap:anywhere]"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 sm:p-5"
        >
          <span className="flex items-start gap-3">
            <UserRoundCheck className="mt-1 h-5 w-5 shrink-0 text-rose-700" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-base font-semibold text-slate-950">
                  {item.customerName}
                </span>
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                  Crew attention required
                </span>
              </span>
              <span className="mt-2 block text-base font-medium leading-6 text-slate-900">
                {item.issues[0]?.customerRequest ||
                  item.issues[0]?.reason ||
                  item.fallbackReason}
              </span>
              {item.issues.length > 1 ? (
                <span className="mt-1 block text-sm text-rose-800">
                  {item.issues.length} unresolved issues in this conversation
                </span>
              ) : null}
              <span className="mt-2 block text-sm text-slate-600">
                Raised {formatMermaidActivity(item.createdAt ?? "")}
                {item.reservation
                  ? ` · Trip ${formatMermaidTripDate(item.reservation.tripDate)}`
                  : ""}
              </span>
            </span>
            <ChevronDown
              className={`mt-1 h-5 w-5 shrink-0 text-teal-700 transition ${open ? "rotate-180" : ""}`}
            />
          </span>
          <span className="mt-3 block rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-800">
            <span className="block font-semibold text-slate-600">
              {recordedMessage
                ? "Guest message that needs attention"
                : context.label}
            </span>
            {recordedMessage ||
              context.message?.content ||
              (detail.isLoading
                ? "Loading the guest’s message…"
                : detail.isError
                  ? "Guest context could not be loaded. The escalation remains open."
                  : "No guest message is available. The recorded reason above is unchanged.")}
          </span>
          <span className="mt-3 block text-sm font-semibold text-teal-800">
            {open ? "Close response panel" : "Review problem & respond"}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent
        forceMount
        hidden={!open}
        className="space-y-5 px-4 pb-5 data-[state=closed]:hidden sm:px-5"
      >
        {item.issues.map((issue) => (
          <section
            key={issue.id}
            aria-label={`Issue ${issue.id}`}
            className="space-y-3"
          >
            <h3 className="text-base font-semibold">Why TRACY needs help</h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
              {issue.reason}
            </p>
            {item.issues.length > 1 && issue.customerMessage ? (
              <blockquote className="rounded-xl bg-slate-50 p-3 text-sm leading-6">
                {issue.customerMessage}
              </blockquote>
            ) : null}
            {issue.context && issue.context !== issue.reason ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {issue.context}
              </p>
            ) : null}
            {issue.decision ? (
              <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                <strong>Decision needed: </strong>
                {issue.decision}
              </p>
            ) : null}
            <MermaidEscalationActions issue={issue} channel={item.channel} />
          </section>
        ))}
        {item.issues.length === 0 ? (
          <p
            role="status"
            className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950"
          >
            The handover has no linked escalation record. Guidance and takeover
            cannot safely target it yet. Open this exact conversation to review
            it; it stays in the queue.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-4 text-sm font-semibold text-teal-800">
          {item.conversationId ? (
            <a
              href={mermaidConversationHref(item.conversationId)}
              className="flex min-h-11 items-center gap-2 underline underline-offset-4"
            >
              <MessageCircleMore className="h-4 w-4" />
              Full conversation
            </a>
          ) : null}
          {item.reservation ? (
            <a
              href={`/reservations/${encodeURIComponent(item.reservation.publicId)}`}
              className="flex min-h-11 items-center underline underline-offset-4"
            >
              Reservation & receipt
            </a>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function MermaidAttentionQueue() {
  const queue = useMermaidAttention();
  return (
    <section
      aria-label="Needs your attention"
      className="min-w-0 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teal-800">Start here</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">
            Needs your attention{" "}
            <span className="ml-2 rounded-full bg-rose-50 px-3 py-1 text-rose-800">
              {queue.complete
                ? queue.items.length
                : queue.items.length
                  ? `${queue.items.length}+`
                  : "—"}
            </span>
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            All unresolved conversations, including earlier days. Unread chats
            alone are not escalations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void queue.refresh()}
          className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-teal-800"
        >
          Refresh queue
        </button>
      </div>
      {!queue.complete ? (
        <p
          role="status"
          className="mb-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950"
        >
          {queue.isLoading
            ? "Checking escalations, conversations and reservation handovers…"
            : "Queue status is incomplete. A source could not be loaded; the count may be higher. Refresh before assuming everything is handled."}
        </p>
      ) : null}
      <div className="space-y-4">
        {queue.items.map((item) => (
          <MermaidAttentionCaseCard key={item.key} item={item} />
        ))}
      </div>
      {queue.complete && queue.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-teal-200 bg-teal-50 p-6 text-center font-medium text-teal-900">
          No unresolved escalations or reservation handovers.
        </p>
      ) : null}
    </section>
  );
}

export function MermaidReservationAttention({
  conversationId,
}: {
  conversationId: string;
}) {
  const queue = useMermaidAttention();
  const cases = queue.items.filter(
    (item) =>
      item.conversationId === conversationId ||
      item.reservation?.conversationId === conversationId,
  );
  return (
    <div className="space-y-4">
      {!queue.complete ? (
        <p
          role="status"
          className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950"
        >
          {queue.isLoading
            ? "Loading the escalation reason…"
            : "Escalation status is incomplete. Refresh before assuming no attention is needed."}
        </p>
      ) : null}
      {cases.map((item) => (
        <MermaidAttentionCaseCard key={item.key} item={item} initiallyOpen />
      ))}
    </div>
  );
}
