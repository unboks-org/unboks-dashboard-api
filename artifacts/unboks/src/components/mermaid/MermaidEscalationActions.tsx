import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, UserRoundCheck } from "lucide-react";
import { useEscalationMutations } from "@/hooks/use-client-api";
import { fetchEscalations } from "@/lib/api";
import {
  mermaidIssue,
  type MermaidAttentionIssue,
} from "@/lib/mermaid-attention";
import { tenantKey } from "@/lib/query-keys";
import { getClientSlug } from "@/lib/tenant";

const control =
  "min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

export function MermaidEscalationActions({
  issue,
  channel,
}: {
  issue: MermaidAttentionIssue;
  channel: string;
}) {
  const { guidance, reply, takeover, handback, resolve } =
    useEscalationMutations();
  const qc = useQueryClient();
  // Keep internal advice separate from text intended for the guest, even when
  // the HO changes mode. Never silently convert an internal draft into a reply.
  const [advice, setAdvice] = useState("");
  const [customerReply, setCustomerReply] = useState("");
  const adviceRevision = useRef<number | null>(null);
  const customerReplyRevision = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  const hard = issue.mode === "hard";
  const draft = hard ? customerReply : advice;
  const supported = ["whatsapp", "email"].includes(channel.toLowerCase());

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: tenantKey("escalations") }),
      qc.invalidateQueries({ queryKey: tenantKey("conversation") }),
      qc.invalidateQueries({ queryKey: tenantKey("conversations") }),
      qc.invalidateQueries({ queryKey: tenantKey("mermaid-reservations") }),
      qc.invalidateQueries({ queryKey: tenantKey("mermaid-reservation") }),
    ]);

  async function run(action: "send" | "takeover" | "handback" | "resolve") {
    if (inFlight.current || (action === "send" && !draft.trim())) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    const tenant = getClientSlug();
    const body = draft.trim();
    const expectedRevision =
      (hard ? customerReplyRevision.current : adviceRevision.current) ??
      issue.contentRevision;
    try {
      // Another HO may have changed the mode or resolved the case since this
      // screen loaded. Recheck before sending; never guess the recipient.
      const fresh = (await fetchEscalations("all"))
        .map(mermaidIssue)
        .find((row) => row?.id === issue.id);
      if (tenant !== getClientSlug())
        throw new Error(
          "Workspace changed. Reopen this case before continuing.",
        );
      if (!fresh)
        throw new Error(
          "This escalation is no longer open. Refresh the queue.",
        );
      if (fresh.contentRevision !== expectedRevision)
        throw new Error(
          "This case changed while you were writing. Review the latest guest message before sending.",
        );
      if (action === "send" && (fresh.mode !== issue.mode || !fresh.mode)) {
        throw new Error(
          "The reply mode changed. Review the updated case before sending.",
        );
      }
      if (action === "send") {
        if (!supported)
          throw new Error("Replies for this channel are not supported here.");
        if (hard) {
          await reply.mutateAsync({
            id: issue.id,
            message: body,
            contentRevision: expectedRevision,
          });
          setCustomerReply("");
          customerReplyRevision.current = null;
        } else {
          await guidance.mutateAsync({
            id: issue.id,
            payload: {
              guidance: body,
              content_revision: expectedRevision,
            },
          });
          setAdvice("");
          adviceRevision.current = null;
        }
        setNotice({
          error: false,
          text: hard
            ? "Your reply was sent to the guest. Mark resolved when the issue is handled."
            : "TRACY’s reply was sent using your guidance. Mark resolved when the issue is handled.",
        });
      } else if (action === "takeover") {
        await takeover.mutateAsync({
          id: issue.id,
          contentRevision: expectedRevision,
        });
        setNotice({
          error: false,
          text: "Takeover requested. Direct reply is available once the updated mode is confirmed.",
        });
      } else if (action === "handback") {
        await handback.mutateAsync({
          id: issue.id,
          contentRevision: expectedRevision,
        });
        setNotice({
          error: false,
          text: "Returned to TRACY. Review the updated mode before sending guidance.",
        });
      } else {
        const result = await resolve.mutateAsync({
          id: issue.id,
          payload: { content_revision: expectedRevision },
        });
        if (result?.ok !== true)
          throw new Error("Resolution was not confirmed.");
        setNotice({ error: false, text: "Escalation resolved." });
      }
    } catch (error) {
      setNotice({
        error: true,
        text: `${error instanceof Error ? error.message : "The action was not confirmed."}${action === "send" ? " Your draft is kept. If delivery was not confirmed, retry unchanged to reuse the same request." : " Refresh before retrying."}`,
      });
    } finally {
      await refresh();
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 border-t border-slate-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-950">
            {hard ? "Reply directly to the guest" : "Give TRACY the answer"}
          </h4>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {hard
              ? "You are handling this conversation. TRACY is paused; your reply is sent as written."
              : "Internal guidance to TRACY. TRACY uses your answer to write and send the guest’s reply."}
          </p>
        </div>
        {hard ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("handback")}
            className={`${control} border-teal-200 text-teal-800`}
          >
            Return to TRACY
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("takeover")}
            className={`${control} flex items-center gap-2 border-rose-200 text-rose-800`}
          >
            <UserRoundCheck className="h-4 w-4" />
            Take over & reply myself
          </button>
        )}
      </div>
      <label className="block text-sm font-semibold text-slate-800">
        {hard ? "Your message to the guest" : "Your guidance to TRACY"}
        <textarea
          value={draft}
          onChange={(event) =>
            (() => {
              const next = event.target.value;
              if (hard) {
                if (!customerReply.trim() && next.trim())
                  customerReplyRevision.current = issue.contentRevision;
                if (!next.trim()) customerReplyRevision.current = null;
                setCustomerReply(next);
              } else {
                if (!advice.trim() && next.trim())
                  adviceRevision.current = issue.contentRevision;
                if (!next.trim()) adviceRevision.current = null;
                setAdvice(next);
              }
            })()
          }
          disabled={busy || !supported || !issue.mode}
          rows={4}
          placeholder={
            hard
              ? "Write the exact reply the guest should receive…"
              : "Tell TRACY what the guest needs to know…"
          }
          className="mt-2 block w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-base font-normal leading-6 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-100"
        />
      </label>
      {!supported || !issue.mode ? (
        <p role="status" className="text-sm text-amber-900">
          {!supported
            ? "This channel cannot send replies from this panel."
            : "Reply mode has not been confirmed. Take over explicitly before replying to the guest."}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void run("send")}
          disabled={busy || !draft.trim() || !supported || !issue.mode}
          className={`${control} flex items-center gap-2 border-[#073b49] bg-[#073b49] text-white`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {hard ? "Send reply to guest" : "Send guidance to TRACY"}
        </button>
        <button
          type="button"
          disabled={busy || Boolean(advice.trim() || customerReply.trim())}
          onClick={() => void run("resolve")}
          title="Resolve only when handled. Unsent drafts must be sent or cleared first."
          className={`${control} border-slate-300 text-slate-700`}
        >
          Mark resolved
        </button>
      </div>
      {notice ? (
        <p
          role={notice.error ? "alert" : "status"}
          className={`rounded-xl p-3 text-sm leading-6 ${notice.error ? "bg-amber-50 text-amber-950" : "bg-teal-50 text-teal-950"}`}
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
