import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertOctagon, X, ShieldOff, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { disconnectUnboks } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { useEnabledChannels } from "@/hooks/use-enabled-channels";
import { useDisconnectState } from "@/hooks/use-disconnect-state";

/**
 * Danger-zone card + multi-step typed-confirmation modal for the
 * "Disconnect Unboks" workspace action.
 *
 * Visual reference: GitHub-style danger zone + the Mymind Delete
 * Account modal (Refero screen 79cc0279) — uppercase DANGER ZONE
 * label, large headline, typed confirmation, prominent destructive
 * button that stays disabled until the typed string matches exactly.
 *
 * Backend honesty:
 *   - Calls `disconnectUnboks(reason)` which tries the real endpoint
 *     and falls back gracefully when it isn't deployed.
 *   - On `"confirmed"`: workspace state flips to Disconnected and a
 *     persistent banner replaces the danger-zone CTA.
 *   - On `"missing-backend"`: workspace state flips to "Disconnect
 *     requested (local on this device)" with copy that explicitly
 *     tells the operator to contact Unboks to finish the job. We do
 *     NOT pretend the providers were revoked.
 */

const CONFIRM_PHRASE = "DISCONNECT";

export function DisconnectUnboksDanger() {
  const [open, setOpen] = useState(false);
  const { status, record, setConfirmed, setRequested } = useDisconnectState();
  const { enabledChannels } = useEnabledChannels();

  // ----- Disconnected / requested state: replace the CTA with an
  // honest banner so the operator can't double-click the action and
  // can see the precise label backend support delivered.
  if (status !== "active") {
    return (
      <DisconnectedBanner
        status={status}
        at={record?.at}
        note={record?.note}
      />
    );
  }

  return (
    <>
      <section
        className="overflow-hidden rounded-2xl border border-[#f4c7c3] bg-white"
        aria-labelledby="danger-disconnect-title"
      >
        <div className="border-b border-[#fde7e5] bg-[#fef6f5] px-5 py-3 sm:px-6">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#a50e0e]">
            Danger zone
          </p>
        </div>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#fce8e6] text-[#a50e0e]"
            >
              <ShieldOff className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3
                id="danger-disconnect-title"
                className="text-[14px] font-semibold text-[#202124]"
              >
                Disconnect Unboks
              </h3>
              <p className="mt-1 text-[13px] leading-[1.5] text-[#5f6368]">
                Stop Unboks from handling customer messages and disconnect the
                connected channels for this workspace.
              </p>
              <p className="mt-2 text-[12px] leading-[1.5] text-[#80868b]">
                Your dashboard history will remain available unless deleted
                separately, but Unboks will stop receiving or handling new
                messages for the disconnected channels.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-[#a50e0e] bg-white px-3.5 py-1.5",
                "text-[13px] font-medium text-[#a50e0e] transition-colors",
                "hover:bg-[#fce8e6] active:bg-[#f9d6d2]",
                "focus:outline-none focus:ring-2 focus:ring-[#f4c7c3] focus:ring-offset-1",
              )}
            >
              <AlertOctagon className="h-3.5 w-3.5" />
              Disconnect Unboks
            </button>
          </div>
        </div>
      </section>

      <DisconnectModal
        open={open}
        onClose={() => setOpen(false)}
        connectedChannels={enabledChannels}
        onConfirmed={(note) => {
          setConfirmed(note);
          setOpen(false);
        }}
        onRequested={(note) => {
          setRequested(note);
          setOpen(false);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Disconnected state banner (replaces the CTA card once the action ran)
// ---------------------------------------------------------------------------

function DisconnectedBanner({
  status,
  at,
  note,
}: {
  status: "requested" | "confirmed";
  at?: string;
  note?: string;
}) {
  const when = useMemo(() => {
    if (!at) return null;
    const ms = Date.parse(at);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toLocaleString();
  }, [at]);

  const isRequested = status === "requested";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-white",
        isRequested ? "border-[#fde293]" : "border-[#dadce0]",
      )}
      aria-live="polite"
    >
      <div
        className={cn(
          "border-b px-5 py-3 sm:px-6",
          isRequested
            ? "border-[#fde293] bg-[#fef7e0]"
            : "border-[#e8eaed] bg-[#f8f9fb]",
        )}
      >
        <p
          className={cn(
            "text-[10.5px] font-semibold uppercase tracking-[0.08em]",
            isRequested ? "text-[#a06800]" : "text-[#5f6368]",
          )}
        >
          {isRequested ? "Disconnect requested" : "Disconnected"}
        </p>
      </div>
      <div className="space-y-3 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "grid h-8 w-8 flex-shrink-0 place-items-center rounded-full",
              isRequested
                ? "bg-[#fef7e0] text-[#a06800]"
                : "bg-[#f1f3f4] text-[#5f6368]",
            )}
          >
            <ShieldOff className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-[#202124]">
              {isRequested
                ? "Disconnect requested — contact Unboks to complete"
                : "Unboks is not currently handling customer messages"}
            </h3>
            <p className="mt-1 text-[13px] leading-[1.5] text-[#5f6368]">
              {isRequested
                ? "Your request was recorded on this device. Unboks will need to fully remove provider access — please contact your Unboks operator to complete the disconnect."
                : "New messages on the connected channels won't be picked up until the workspace is reactivated."}
            </p>
            {note && (
              <p className="mt-2 rounded-lg border border-[#e8eaed] bg-[#f8f9fb] px-3 py-2 text-[12px] leading-[1.5] text-[#5f6368]">
                {note}
              </p>
            )}
            {when && (
              <p className="mt-2 text-[11.5px] text-[#9aa0a6]">
                {isRequested ? "Requested" : "Disconnected"} on {when}
              </p>
            )}
          </div>
        </div>
        <p className="text-[12px] text-[#80868b]">
          Contact Unboks to reconnect this workspace.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Multi-step typed-confirmation modal
// ---------------------------------------------------------------------------

interface DisconnectModalProps {
  open: boolean;
  onClose: () => void;
  connectedChannels: ReadonlyArray<string>;
  onConfirmed: (note?: string) => void;
  onRequested: (note: string) => void;
}

function DisconnectModal({
  open,
  onClose,
  connectedChannels,
  onConfirmed,
  onRequested,
}: DisconnectModalProps) {
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Capture the element that had focus before the modal opened so we
  // can hand focus back to it on close — required for keyboard /
  // screen-reader users so context isn't lost when the modal unmounts.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Reset modal whenever it (re)opens — never inherit stale typed text
  // or error state from a previous attempt. Also remember the
  // previously focused element and restore it on close.
  useEffect(() => {
    if (!open) return;
    setTyped("");
    setError(null);
    setSubmitting(false);
    previouslyFocusedRef.current =
      (document.activeElement as HTMLElement | null) ?? null;
    // Defer focus to the next paint so the modal is in the DOM.
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(id);
      // Restore focus to the trigger after the modal unmounts.
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === "function") {
        try {
          prev.focus();
        } catch {
          // Element may have been removed from the DOM — ignore.
        }
      }
    };
  }, [open]);

  // Keyboard handling at modal scope:
  //   - Esc closes the modal (unless submitting), and we stop the
  //     event so background Esc handlers don't double-fire.
  //   - Tab / Shift+Tab cycle within the modal so focus can never
  //     escape into the background page while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const FOCUSABLE_SELECTOR =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (submitting) return;
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (n) =>
          !n.hasAttribute("disabled") &&
          n.getAttribute("aria-hidden") !== "true" &&
          n.offsetParent !== null,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    // Capture phase so we can stop Esc before it bubbles to global
    // listeners that might also act on it.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const matches = typed === CONFIRM_PHRASE;

  const handleConfirm = async () => {
    if (!matches || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const outcome = await disconnectUnboks();
      if (outcome.kind === "confirmed") {
        toast.success("Unboks has been disconnected for this workspace.");
        onConfirmed();
      } else {
        // Honest fallback: backend doesn't expose disconnect yet.
        toast.success("Disconnect requested — local on this device", {
          description: "Contact Unboks to fully remove provider access.",
        });
        onRequested(outcome.message);
      }
    } catch (err) {
      let msg = "Couldn't disconnect Unboks. Please try again.";
      if (err instanceof ApiError) {
        if (err.message && err.message.trim().length > 0) msg = err.message;
        else msg = `Request failed (${err.status}).`;
      } else if (err instanceof Error && err.message) {
        msg = err.message;
      }
      setError(msg);
      setSubmitting(false);
    }
  };

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disconnect-modal-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#202124]/50 px-4 py-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-[460px] overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          disabled={submitting}
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-[#5f6368] transition-colors hover:bg-[#f1f3f4] disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="px-6 pb-6 pt-7 sm:px-7">
          <p className="text-center text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#a50e0e]">
            Danger zone
          </p>
          <h2
            id="disconnect-modal-title"
            className="mt-2 text-center text-[20px] font-semibold leading-tight text-[#202124]"
          >
            Disconnect Unboks?
          </h2>
          <p className="mt-3 text-center text-[13px] leading-[1.55] text-[#5f6368]">
            This will stop Unboks from handling new customer messages for this
            workspace. Connected channels may need to be reconnected before
            Unboks can be used again.
          </p>

          <div className="mt-5 rounded-xl border border-[#e8eaed] bg-[#f8f9fb] px-4 py-3">
            <p className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#5f6368]">
              Connected channels for this workspace
            </p>
            {connectedChannels.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {connectedChannels.map((ch) => (
                  <li
                    key={ch}
                    className="inline-flex items-center rounded-full border border-[#dadce0] bg-white px-2 py-0.5 text-[11.5px] text-[#3c4043]"
                  >
                    {ch}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[12px] text-[#9aa0a6]">
                No channels are currently visible for this workspace.
              </p>
            )}
          </div>

          <label className="mt-5 block">
            <span className="text-[12.5px] text-[#3c4043]">
              To confirm, type{" "}
              <span className="rounded bg-[#fce8e6] px-1 font-mono text-[12px] text-[#a50e0e]">
                {CONFIRM_PHRASE}
              </span>
            </span>
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches && !submitting) {
                  e.preventDefault();
                  void handleConfirm();
                }
              }}
              disabled={submitting}
              className={cn(
                "mt-1.5 w-full rounded-lg border px-3 py-2 font-mono text-[13px] tracking-[0.04em] outline-none transition-colors",
                "focus:border-[#a50e0e] focus:ring-2 focus:ring-[#fde7e5]",
                matches
                  ? "border-[#34a853] bg-white text-[#202124]"
                  : "border-[#dadce0] bg-white text-[#202124]",
              )}
              aria-describedby="disconnect-modal-typed-help"
              aria-invalid={typed.length > 0 && !matches}
            />
            <span
              id="disconnect-modal-typed-help"
              className="mt-1 block text-[11px] text-[#9aa0a6]"
            >
              Type the word above exactly. Capitalisation matters.
            </span>
          </label>

          {error && (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-[#f4c7c3] bg-[#fce8e6] px-3 py-2 text-[12px] leading-[1.5] text-[#a50e0e]"
            >
              {error}
            </div>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-[#dadce0] bg-white px-3.5 py-2 text-[13px] font-medium text-[#3c4043] transition-colors hover:bg-[#f6f8fc] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!matches || submitting}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors",
                matches && !submitting
                  ? "bg-[#a50e0e] text-white hover:bg-[#8c0a0a] active:bg-[#700808]"
                  : "bg-[#fce8e6] text-[#a50e0e]/60 cursor-not-allowed",
              )}
              aria-disabled={!matches || submitting}
            >
              {submitting ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                  Disconnecting…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Disconnect Unboks
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
