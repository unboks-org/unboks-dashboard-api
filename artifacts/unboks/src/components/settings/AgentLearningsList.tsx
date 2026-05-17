/**
 * AgentLearningsList (R2-32 / R2-34, Claudia #32)
 *
 * Settings card showing every escalation-derived learning candidate.
 * Three tabs: Pending / Approved / Dismissed.
 *
 *   - Pending  → operator can Approve, Edit + Save, or Dismiss.
 *   - Approved → read-only history of what the Agent now uses.
 *   - Dismissed → read-only history; entries are deliberately styled
 *                 as "not active" so they never look like Agent
 *                 knowledge.
 *
 * Pending and dismissed entries have explicit visual treatment that
 * separates them from active knowledge: a calm neutral container, no
 * green/success accents, an explicit status pill on every row.
 *
 * No em dashes anywhere in user-visible copy.
 */

import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Check, Pencil, X } from "lucide-react";
import {
  useEscalationLearnings,
  useEscalationLearningMutations,
  useAgentLearningPrefs,
  useAgentLearningPrefsMutation,
} from "@/hooks/use-client-api";
import { DEFAULT_AGENT_LEARNING_PREFS, type AgentLearningPrefs } from "@/lib/api";
import { useDashboardIdentity } from "@/hooks/use-dashboard-identity";
import { ApiError } from "@/lib/error";
import type { EscalationLearning, EscalationLearningStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const TABS: { id: EscalationLearningStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "dismissed", label: "Dismissed" },
];

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

function formatWhen(iso?: string): string {
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

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

function StatusPill({ status }: { status: EscalationLearningStatus }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-medium bg-[#e6f4ea] text-[#137333]">
        Approved
      </span>
    );
  }
  if (status === "dismissed") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-medium bg-[#f1f3f4] text-[#5f6368]">
        Not saved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-medium bg-[#fef7e0] text-[#5f3e00]">
      Pending review
    </span>
  );
}

function PendingRow({ entry }: { entry: EscalationLearning }) {
  const { identity } = useDashboardIdentity();
  const { edit, approve, dismiss } = useEscalationLearningMutations();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.suggestedText);
  const [rowError, setRowError] = useState<string | null>(null);

  const busy = edit.isPending || approve.isPending || dismiss.isPending;

  const handleApprove = () => {
    if (busy) return;
    setRowError(null);
    approve.mutate({ id: entry.id, operator: identity }, {
      onError: (err) => setRowError(getErrorMessage(err)),
    });
  };

  const handleSaveAndApprove = () => {
    if (busy) return;
    const trimmed = draft.trim();
    if (!trimmed) {
      setRowError("The learning text cannot be empty.");
      return;
    }
    setRowError(null);
    if (trimmed === entry.suggestedText.trim()) {
      handleApprove();
      return;
    }
    edit.mutate({ id: entry.id, suggestedText: trimmed }, {
      onSuccess: () => {
        approve.mutate({ id: entry.id, operator: identity }, {
          onError: (err) => setRowError(getErrorMessage(err)),
        });
      },
      onError: (err) => setRowError(getErrorMessage(err)),
    });
  };

  const handleDismiss = () => {
    if (busy) return;
    setRowError(null);
    dismiss.mutate(entry.id, {
      onError: (err) => setRowError(getErrorMessage(err)),
    });
  };

  return (
    <li className="rounded-lg border border-[#e6e8eb] bg-white px-3 py-3">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <StatusPill status="pending" />
          <span className="text-[11.5px] text-[#5f6368]">
            {formatChannel(entry.channel)} · {formatWhen(entry.createdAt)}
            {entry.operator ? ` · ${entry.operator}` : ""}
          </span>
        </div>
      </div>

      {entry.sourceQuestion && (
        <div className="mb-2">
          <p className="text-[10.5px] font-medium uppercase tracking-wide text-[#5f6368]">
            Customer question
          </p>
          <p className="mt-0.5 text-[12.5px] text-[#3c4043] bg-[#fbfbfd] border border-[#e6e8eb] rounded-md px-2 py-1.5 whitespace-pre-wrap break-words leading-snug">
            {entry.sourceQuestion}
          </p>
        </div>
      )}

      <p className="text-[10.5px] font-medium uppercase tracking-wide text-[#5f6368]">
        Suggested learning
      </p>
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (rowError) setRowError(null);
          }}
          rows={4}
          aria-label="Edit suggested learning"
          className="mt-0.5 w-full text-[13px] text-[#202124] border border-[#dadce0] rounded-md px-2.5 py-1.5 outline-none resize-y focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] transition-colors"
        />
      ) : (
        <p className="mt-0.5 text-[13px] text-[#1f2937] whitespace-pre-wrap break-words leading-snug">
          {entry.suggestedText}
        </p>
      )}

      {rowError && (
        <p role="alert" className="mt-2 text-[12px] text-[#5f1414] bg-[#fce8e6] border border-[#f6c6c2] rounded-md px-2 py-1.5">
          {rowError}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          disabled={busy}
          className={cn(
            "inline-flex items-center justify-center rounded-full px-3 py-1 min-h-[32px] text-[12.5px] font-medium",
            "border border-[#dadce0] bg-white text-[#5f6368] hover:bg-[#f1f3f4] transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {dismiss.isPending ? "Dismissing..." : "Do not save"}
        </button>
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => { setDraft(entry.suggestedText); setEditing(false); setRowError(null); }}
              disabled={busy}
              className="inline-flex items-center justify-center rounded-full px-3 py-1 min-h-[32px] text-[12.5px] font-medium border border-[#dadce0] bg-white text-[#3c4043] hover:bg-[#f1f3f4] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAndApprove}
              disabled={busy || draft.trim().length === 0}
              className="inline-flex items-center justify-center gap-1 rounded-full px-3 py-1 min-h-[32px] text-[12.5px] font-semibold text-white bg-[#1a73e8] hover:bg-[#1765cc] transition-colors shadow-sm disabled:bg-[#c4c8cf] disabled:cursor-not-allowed"
            >
              <Check className="w-3 h-3" />
              {edit.isPending ? "Saving..." : approve.isPending ? "Approving..." : "Save and approve"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { setEditing(true); setRowError(null); }}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1 rounded-full px-3 py-1 min-h-[32px] text-[12.5px] font-medium border border-[#dadce0] bg-white text-[#3c4043] hover:bg-[#f1f3f4] transition-colors disabled:opacity-50"
            >
              <Pencil className="w-3 h-3" />
              Edit first
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1 rounded-full px-3 py-1 min-h-[32px] text-[12.5px] font-semibold text-white bg-[#1a73e8] hover:bg-[#1765cc] transition-colors shadow-sm disabled:bg-[#c4c8cf] disabled:cursor-not-allowed"
            >
              <Check className="w-3 h-3" />
              {approve.isPending ? "Approving..." : "Approve learning"}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function ReadOnlyRow({ entry }: { entry: EscalationLearning }) {
  // Dismissed entries get an extra visual hint (muted background, opacity)
  // so they never look like active Agent knowledge.
  const isDismissed = entry.status === "dismissed";
  return (
    <li
      className={cn(
        "rounded-lg border px-3 py-3",
        isDismissed
          ? "border-[#e6e8eb] bg-[#fbfbfd] opacity-90"
          : "border-[#e6e8eb] bg-white",
      )}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <StatusPill status={entry.status} />
          <span className="text-[11.5px] text-[#5f6368]">
            {formatChannel(entry.channel)}
            {" · "}
            {entry.status === "approved"
              ? `Approved ${formatWhen(entry.approvedAt ?? entry.updatedAt ?? entry.createdAt)}`
              : entry.status === "dismissed"
              ? `Dismissed ${formatWhen(entry.dismissedAt ?? entry.updatedAt ?? entry.createdAt)}`
              : formatWhen(entry.createdAt)}
            {entry.approvedBy ? ` · by ${entry.approvedBy}` : entry.operator ? ` · by ${entry.operator}` : ""}
          </span>
        </div>
      </div>

      {entry.sourceQuestion && (
        <div className="mb-2">
          <p className="text-[10.5px] font-medium uppercase tracking-wide text-[#5f6368]">
            Customer question
          </p>
          <p className={cn(
            "mt-0.5 text-[12.5px] border rounded-md px-2 py-1.5 whitespace-pre-wrap break-words leading-snug",
            isDismissed
              ? "text-[#5f6368] bg-white border-[#e6e8eb] line-through decoration-[#9aa0a6]/60"
              : "text-[#3c4043] bg-[#fbfbfd] border-[#e6e8eb]",
          )}>
            {entry.sourceQuestion}
          </p>
        </div>
      )}

      <p className="text-[10.5px] font-medium uppercase tracking-wide text-[#5f6368]">
        {entry.status === "approved" ? "Learning text" : "Suggested learning"}
      </p>
      <p className={cn(
        "mt-0.5 text-[13px] whitespace-pre-wrap break-words leading-snug",
        isDismissed ? "text-[#5f6368] line-through decoration-[#9aa0a6]/60" : "text-[#1f2937]",
      )}>
        {entry.suggestedText}
      </p>
    </li>
  );
}

/**
 * Behavior toggles for the suggested-learning flow (R2-35).
 *
 * Backed by Claudia #35:
 *   GET/PUT /api/{tenant}/dashboard/api/settings/agent-learnings
 * Tenant-scoped, server-persisted, no localStorage fallback. Server is
 * the source of truth — every dashboard instance reads the same row,
 * so the toggle state syncs across browsers, devices, and teammates.
 *
 * Critical rule: neither toggle ever auto-approves a learning. The
 * "automatic" path here means "create a row in PENDING for review",
 * never "add to live Agent knowledge".
 */
function AgentLearningPrefsCard() {
  const { data: prefs, isLoading, isError, error, isFetching } = useAgentLearningPrefs();
  const mutation = useAgentLearningPrefsMutation();

  // Until the first GET resolves we hide the toggles entirely behind a
  // skeleton — better than showing a value the operator might think is
  // authoritative.
  const value: AgentLearningPrefs = prefs ?? DEFAULT_AGENT_LEARNING_PREFS;

  const update = (patch: Partial<AgentLearningPrefs>) => {
    if (mutation.isPending) return;
    mutation.mutate({ ...value, ...patch });
  };

  const togglesDisabled = isLoading || mutation.isPending || (isError && !prefs);

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white">
      <header className="px-4 sm:px-5 pt-4 pb-3 border-b border-[#e8eaed]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[#1f2937]">Behavior</h3>
            <p className="mt-0.5 text-[12.5px] text-[#5f6368] leading-snug">
              Control how Unboks learns from operator replies. This setting only affects when pending learnings are created. Nothing is added to your Agent without your approval.
            </p>
          </div>
          <SaveStatusBadge
            isSaving={mutation.isPending}
            isError={mutation.isError}
            isSyncing={isFetching && !isLoading && !mutation.isPending}
            lastSavedAt={mutation.isSuccess ? mutation.submittedAt : null}
          />
        </div>
      </header>

      <div className="px-4 sm:px-5 py-4 space-y-4">
        {isError && !prefs && (
          <p
            role="alert"
            className="text-[12.5px] text-[#5f1414] bg-[#fce8e6] border border-[#f6c6c2] rounded-md px-2.5 py-2"
          >
            Could not load behaviour settings: {getErrorMessage(error)}
          </p>
        )}
        <ToggleRow
          id="create-pending-learning-from-operator-replies"
          title="Create pending learning from operator replies"
          description="When on, operator replies are saved as pending learnings for review. They are not used by the Agent until approved."
          checked={value.createPendingLearningFromOperatorReplies}
          disabled={togglesDisabled}
          onChange={(next) => update({ createPendingLearningFromOperatorReplies: next })}
        />
        {mutation.isError && (
          <p role="alert" className="text-[12.5px] text-[#5f1414] bg-[#fce8e6] border border-[#f6c6c2] rounded-md px-2.5 py-2">
            Could not save: {getErrorMessage(mutation.error)}
          </p>
        )}
      </div>
    </section>
  );
}

interface SaveStatusBadgeProps {
  isSaving: boolean;
  isError: boolean;
  isSyncing: boolean;
  lastSavedAt: number | null;
}

/**
 * Compact, accessible status badge that surfaces the lifecycle of a
 * PUT to /settings/agent-learnings.
 *
 *   - Saving        → shown while the PUT is in flight.
 *   - Saved         → shown for ~2s after a successful PUT.
 *   - Sync failed   → shown when the last PUT errored.
 *   - Syncing       → shown when a background GET is refetching
 *                     (e.g. window focus) so the operator knows the
 *                     value may be about to update from another device.
 *   - (nothing)     → idle.
 */
function SaveStatusBadge({ isSaving, isError, isSyncing, lastSavedAt }: SaveStatusBadgeProps) {
  const lastShownAtRef = useRef<number | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);

  useEffect(() => {
    if (!lastSavedAt || lastSavedAt === lastShownAtRef.current) return;
    lastShownAtRef.current = lastSavedAt;
    setSavedVisible(true);
    const t = window.setTimeout(() => setSavedVisible(false), 2000);
    return () => window.clearTimeout(t);
  }, [lastSavedAt]);

  if (isSaving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-[#5f6368] flex-shrink-0">
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        Saving
      </span>
    );
  }
  if (isError) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-[#5f1414] flex-shrink-0" role="status">
        <X className="w-3 h-3" aria-hidden="true" />
        Sync failed
      </span>
    );
  }
  if (savedVisible) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-[#1e7e34] flex-shrink-0" role="status">
        <Check className="w-3 h-3" aria-hidden="true" />
        Saved
      </span>
    );
  }
  if (isSyncing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-[#5f6368] flex-shrink-0">
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        Syncing
      </span>
    );
  }
  return null;
}


interface ToggleRowProps {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow({ id, title, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[13.5px] font-medium text-[#1f2937] cursor-pointer">
          {title}
        </label>
        <p className="mt-0.5 text-[12.5px] text-[#5f6368] leading-snug">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-[22px] w-[38px] flex-shrink-0 items-center rounded-full transition-colors mt-0.5",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-1",
          checked ? "bg-[#1a73e8]" : "bg-[#dadce0]",
          disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
          )}
        />
      </button>
    </div>
  );
}

const COLLAPSED_LIMIT = 3;

export function AgentLearningsList() {
  const [tab, setTab] = useState<EscalationLearningStatus>("pending");
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, isError, error } = useEscalationLearnings(tab);

  // R2-41: show the latest entries first so the default 3 are the most
  // relevant. Sort by status-appropriate timestamp, falling back to
  // createdAt when the lifecycle timestamp is missing. Sort is stable
  // for equal keys so React keys stay stable across renders.
  const entries = [...(data ?? [])].sort((a, b) => {
    const ka =
      a.status === "approved"
        ? a.approvedAt ?? a.updatedAt ?? a.createdAt
        : a.status === "dismissed"
        ? a.dismissedAt ?? a.updatedAt ?? a.createdAt
        : a.createdAt;
    const kb =
      b.status === "approved"
        ? b.approvedAt ?? b.updatedAt ?? b.createdAt
        : b.status === "dismissed"
        ? b.dismissedAt ?? b.updatedAt ?? b.createdAt
        : b.createdAt;
    return Date.parse(kb ?? "") - Date.parse(ka ?? "");
  });

  const total = entries.length;
  const overflow = Math.max(0, total - COLLAPSED_LIMIT);
  const visibleEntries = expanded ? entries : entries.slice(0, COLLAPSED_LIMIT);

  const handleSelectTab = (next: EscalationLearningStatus) => {
    if (next === tab) return;
    setTab(next);
    // R2-41: each tab starts collapsed so the operator sees the latest
    // 3 first when switching contexts.
    setExpanded(false);
  };

  return (
    <div className="space-y-5">
      <AgentLearningPrefsCard />

      <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white">
      <header className="px-4 sm:px-5 pt-4 pb-3 border-b border-[#e8eaed]">
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className="mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#f0f6ff] text-[#1a73e8] flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[#1f2937]">Agent learnings</h3>
            <p className="mt-0.5 text-[12.5px] text-[#5f6368] leading-snug">
              Answers your team gave during escalations. Approved entries become part of your Agent's knowledge. Pending and dismissed entries are not used by the Agent.
            </p>
          </div>
        </div>
        <div role="tablist" aria-label="Agent learning status" className="mt-3 inline-flex rounded-full border border-[#e6e8eb] bg-[#fbfbfd] p-0.5">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => handleSelectTab(t.id)}
                className={cn(
                  "px-3 py-1 rounded-full text-[12.5px] font-medium transition-colors",
                  active
                    ? "bg-white text-[#1f2937] shadow-sm border border-[#e6e8eb]"
                    : "text-[#5f6368] hover:text-[#1f2937]",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="px-4 sm:px-5 py-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-[#5f6368]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        ) : isError ? (
          <div className="rounded-md border border-[#f6c6c2] bg-[#fce8e6] text-[#5f1414] text-[13px] px-3 py-2">
            <X className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
            {getErrorMessage(error)}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-[13px] text-[#5f6368]">
            {tab === "pending"
              ? "No suggestions waiting. New ones appear here after you reply to or resolve an escalation."
              : tab === "approved"
              ? "No approved learnings yet."
              : "No dismissed learnings."}
          </p>
        ) : (
          <>
            <ul className="space-y-2.5">
              {visibleEntries.map((entry) =>
                entry.status === "pending" ? (
                  <PendingRow key={entry.id} entry={entry} />
                ) : (
                  <ReadOnlyRow key={entry.id} entry={entry} />
                ),
              )}
            </ul>
            {overflow > 0 && (
              <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[12px] text-[#5f6368]">
                  {expanded
                    ? `Showing all ${total}.`
                    : `Showing ${COLLAPSED_LIMIT} of ${total}.`}
                </p>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  className="inline-flex items-center justify-center rounded-full px-3 py-1 min-h-[32px] text-[12.5px] font-medium border border-[#dadce0] bg-white text-[#1a73e8] hover:bg-[#f0f6ff] transition-colors"
                >
                  {expanded ? "Show less" : `See more (${overflow})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      </section>
    </div>
  );
}
