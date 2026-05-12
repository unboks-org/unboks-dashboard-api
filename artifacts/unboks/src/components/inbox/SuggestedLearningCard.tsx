/**
 * SuggestedLearningCard (R2-32 / R2-34, Claudia #32)
 *
 * Modal card the operator sees right after they Send, Send & Resolve, or
 * Resolve an escalation with a non-empty draft. The card asks whether the
 * answer they just gave should be saved as a learning the Agent can re-use
 * for similar future questions.
 *
 * Three explicit actions:
 *   - Approve learning      → POST /escalation-learnings/{id}/approve
 *   - Edit first            → toggle to a textarea, Save edit + Approve
 *   - Do not save           → POST /escalation-learnings/{id}/dismiss
 *
 * Visual rules:
 *   - This is a SUGGESTION, not active knowledge. Calm neutral styling,
 *     never a green/success treatment.
 *   - No internal prompts, system instructions, or tenant data shown.
 *   - Backend errors surface their `detail` field via ApiError.message.
 *
 * Lifecycle:
 *   - The parent (Inbox) is responsible for actually creating the
 *     pending row by POSTing to `/escalations/{id}/suggest-learning`
 *     before mounting this card. The card receives the resulting
 *     EscalationLearning record as `learning` and only orchestrates
 *     edit/approve/dismiss against it.
 *   - `onDone()` is invoked after any terminal action (or on cancel
 *     without action). The parent decides what to do next (close the
 *     conversation, show a toast, etc.).
 *
 * No em dashes anywhere in user-visible copy.
 */

import { useEffect, useState } from "react";
import { Sparkles, X, Pencil, Check } from "lucide-react";
import { useEscalationLearningMutations } from "@/hooks/use-client-api";
import { useDashboardIdentity } from "@/hooks/use-dashboard-identity";
import { ApiError } from "@/lib/error";
import type { EscalationLearning } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SuggestedLearningCardProps {
  learning: EscalationLearning;
  /**
   * Called after the operator finishes with this card via any path:
   * approve, dismiss, or close-without-action. The parent should use
   * this to dismiss the modal and continue any post-send flow (e.g.
   * close the conversation pane).
   */
  onDone: () => void;
  /**
   * Optional deep-link hook (R2-37, Sonia #37 item 11). When provided,
   * the modal renders a "View all pending learnings" link in the footer
   * so the operator can jump to Settings → Agent learnings → Pending to
   * review the full backlog instead of acting on this single row inline.
   * The parent is responsible for the navigation + closing the modal.
   */
  onViewAllPending?: () => void;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

export function SuggestedLearningCard({ learning, onDone, onViewAllPending }: SuggestedLearningCardProps) {
  const { identity } = useDashboardIdentity();
  const { edit, approve, dismiss } = useEscalationLearningMutations();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(learning.suggestedText);
  const [error, setError] = useState<string | null>(null);

  // If the parent ever swaps the learning under us (rare — same modal
  // typically maps to one suggestion), keep the editable draft in sync.
  useEffect(() => {
    setDraft(learning.suggestedText);
  }, [learning.id, learning.suggestedText]);

  const anyPending = edit.isPending || approve.isPending || dismiss.isPending;

  const handleApprove = () => {
    if (anyPending) return;
    setError(null);
    approve.mutate(
      { id: learning.id, operator: identity },
      {
        onSuccess: () => onDone(),
        onError: (err) => setError(getErrorMessage(err)),
      },
    );
  };

  const handleSaveEditAndApprove = () => {
    if (anyPending) return;
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("The learning text cannot be empty.");
      return;
    }
    if (trimmed === learning.suggestedText.trim()) {
      // Nothing changed. Skip PATCH and go straight to approve.
      handleApprove();
      return;
    }
    setError(null);
    edit.mutate(
      { id: learning.id, suggestedText: trimmed },
      {
        onSuccess: () => {
          approve.mutate(
            { id: learning.id, operator: identity },
            {
              onSuccess: () => onDone(),
              onError: (err) => setError(getErrorMessage(err)),
            },
          );
        },
        onError: (err) => setError(getErrorMessage(err)),
      },
    );
  };

  const handleDismiss = () => {
    if (anyPending) return;
    setError(null);
    dismiss.mutate(learning.id, {
      onSuccess: () => onDone(),
      onError: (err) => setError(getErrorMessage(err)),
    });
  };

  const handleCancelEdit = () => {
    if (anyPending) return;
    setDraft(learning.suggestedText);
    setEditing(false);
    setError(null);
  };

  const handleCloseWithoutAction = () => {
    if (anyPending) return;
    // Closing without an explicit action leaves the row in "pending" so
    // the operator can still review it later in Settings. We do NOT
    // silently approve or dismiss.
    onDone();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="suggested-learning-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 px-3 sm:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCloseWithoutAction();
      }}
      style={{
        // Respect iOS safe-area on the bottom-anchored mobile sheet.
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-[#e8eaed] overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="flex items-start gap-2 min-w-0">
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#f0f6ff] text-[#1a73e8] flex-shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <h2
                id="suggested-learning-title"
                className="text-[14px] font-semibold text-[#1f2937] leading-tight"
              >
                Suggested learning for your Agent
              </h2>
              <p className="mt-1 text-[12.5px] text-[#5f6368] leading-snug">
                This answer may help your Agent handle similar questions in the future. Review it before adding it.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseWithoutAction}
            disabled={anyPending}
            aria-label="Close without saving"
            className="w-8 h-8 -mt-1 -mr-1 flex-shrink-0 inline-flex items-center justify-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4] disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 mt-3 space-y-3">
          {/* Source question — read-only context the operator can scan
              quickly so they understand what this learning will answer. */}
          {learning.sourceQuestion && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#5f6368]">
                Customer question
              </p>
              <p className="mt-1 text-[12.5px] text-[#3c4043] bg-[#fbfbfd] border border-[#e6e8eb] rounded-md px-2.5 py-2 whitespace-pre-wrap break-words leading-snug">
                {learning.sourceQuestion}
              </p>
            </div>
          )}

          {/* Suggested text — read-only by default, becomes a textarea
              when the operator clicks Edit first. */}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#5f6368]">
              Suggested learning
            </p>
            {editing ? (
              <textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (error) setError(null);
                }}
                rows={5}
                autoFocus
                aria-label="Edit suggested learning"
                className="mt-1 w-full text-[13px] text-[#202124] border border-[#dadce0] rounded-md px-2.5 py-2 outline-none resize-y focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] transition-colors"
              />
            ) : (
              <p className="mt-1 text-[13px] text-[#1f2937] bg-white border border-[#e6e8eb] rounded-md px-2.5 py-2 whitespace-pre-wrap break-words leading-snug">
                {learning.suggestedText}
              </p>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="text-[12.5px] text-[#5f1414] bg-[#fce8e6] border border-[#f6c6c2] rounded-md px-2.5 py-2"
            >
              {error}
            </p>
          )}
        </div>

        <div
          className="px-4 pt-3 pb-4 mt-3 border-t border-[#e8eaed] bg-[#fbfbfd] flex flex-wrap items-center justify-between gap-2"
          role="group"
          aria-label="Suggested learning actions"
        >
          {/* R2-37 (Sonia #37, item 11): give the operator a way to leave
              the inline review and visit the full Pending list in
              Settings. Rendered only when the parent provides the
              navigation hook so the modal stays portable. */}
          {onViewAllPending ? (
            <button
              type="button"
              onClick={() => {
                if (anyPending) return;
                onViewAllPending();
              }}
              disabled={anyPending}
              className={cn(
                "text-[12.5px] font-medium text-[#1a73e8] hover:underline",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1 rounded",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline",
              )}
            >
              View all pending learnings
            </button>
          ) : (
            <span aria-hidden="true" />
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={anyPending}
            className={cn(
              "inline-flex items-center justify-center rounded-full px-3.5 py-1.5 min-h-[36px] text-[13px] font-medium",
              "border border-[#dadce0] bg-white text-[#5f6368]",
              "hover:bg-[#f1f3f4] active:bg-[#e6e8eb] transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {dismiss.isPending ? "Dismissing..." : "Do not save"}
          </button>

          {editing ? (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={anyPending}
                className={cn(
                  "inline-flex items-center justify-center rounded-full px-3.5 py-1.5 min-h-[36px] text-[13px] font-medium",
                  "border border-[#dadce0] bg-white text-[#3c4043]",
                  "hover:bg-[#f1f3f4] active:bg-[#e6e8eb] transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditAndApprove}
                disabled={anyPending || draft.trim().length === 0}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 min-h-[36px] text-[13px] font-semibold text-white",
                  "bg-[#1a73e8] hover:bg-[#1765cc] active:bg-[#185abc] transition-colors shadow-sm",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1",
                  "disabled:bg-[#c4c8cf] disabled:text-white disabled:shadow-none disabled:cursor-not-allowed",
                )}
              >
                <Check className="w-3.5 h-3.5" />
                {edit.isPending
                  ? "Saving..."
                  : approve.isPending
                  ? "Approving..."
                  : "Save and approve"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setError(null);
                }}
                disabled={anyPending}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 min-h-[36px] text-[13px] font-medium",
                  "border border-[#dadce0] bg-white text-[#3c4043]",
                  "hover:bg-[#f1f3f4] active:bg-[#e6e8eb] transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit first
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={anyPending}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 min-h-[36px] text-[13px] font-semibold text-white",
                  "bg-[#1a73e8] hover:bg-[#1765cc] active:bg-[#185abc] transition-colors shadow-sm",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1",
                  "disabled:bg-[#c4c8cf] disabled:text-white disabled:shadow-none disabled:cursor-not-allowed",
                )}
              >
                <Check className="w-3.5 h-3.5" />
                {approve.isPending ? "Approving..." : "Approve learning"}
              </button>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
