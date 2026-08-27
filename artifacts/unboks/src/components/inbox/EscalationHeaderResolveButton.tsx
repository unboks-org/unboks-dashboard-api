import { motion } from "framer-motion";
import { CircleCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { tenantText } from "@/lib/tenant-ui";

export interface EscalationHeaderResolveVisibility {
  activeEscalation: boolean;
  archived: boolean;
  resolved: boolean;
  mode: "soft" | "hard" | "order" | null;
  escalationId: string | null;
}

export interface EscalationRenderStateInput {
  detailEscalated?: boolean | null;
  detailResolved?: boolean | null;
  detailMode?: "soft" | "hard" | "order" | null;
  rowEscalated: boolean;
  rowResolved: boolean;
  rowEscalationId?: string | null;
  rowMode?: "soft" | "hard" | "order" | null;
  matchedEscalationId?: string | null;
}

export interface EscalationRenderState {
  active: boolean;
  escalationId: string | null;
  mode: "soft" | "hard" | "order" | null;
}

/**
 * Reconcile the two independently-loaded escalation projections used by the
 * inbox. Rows sourced from `/escalations` are authoritative for active state
 * and identity; the conversation-detail endpoint may legitimately omit its
 * optional escalation fields. A resolved signal from either projection still
 * fails closed into history/read-only mode.
 */
export function resolveEscalationRenderState({
  detailEscalated,
  detailResolved,
  detailMode,
  rowEscalated,
  rowResolved,
  rowEscalationId,
  rowMode,
  matchedEscalationId,
}: EscalationRenderStateInput): EscalationRenderState {
  const escalationId = rowEscalationId || matchedEscalationId || null;
  const resolved = Boolean(detailResolved || rowResolved);
  const activeSignal = Boolean(
    detailEscalated || rowEscalated || escalationId,
  );

  return {
    active: activeSignal && !resolved,
    escalationId,
    mode: detailMode ?? rowMode ?? null,
  };
}

export function canShowEscalationHeaderResolve({
  activeEscalation,
  archived,
  resolved,
  mode,
  escalationId,
}: EscalationHeaderResolveVisibility): boolean {
  return Boolean(
    activeEscalation
      && escalationId
      && !archived
      && !resolved
      && mode !== "order",
  );
}

interface EscalationHeaderResolveButtonProps {
  onResolve: () => void;
  pending: boolean;
  className?: string;
}

export function EscalationHeaderResolveButton({
  onResolve,
  pending,
  className,
}: EscalationHeaderResolveButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      type="button"
      onClick={onResolve}
      disabled={pending}
      aria-label={tenantText("Resolve escalation", "Resolver solicitud")}
      title={tenantText(
        "Mark this escalation resolved",
        "Marcar esta solicitud como resuelta",
      )}
      className={cn(
        "inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full border border-[#a8dab5] bg-[#e6f4ea] px-3 text-[12px] font-semibold text-[#137333] shadow-sm transition-colors hover:bg-[#ceead6] disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      <CircleCheck className="h-[17px] w-[17px]" strokeWidth={1.8} />
      <span>
        {pending
          ? tenantText("Resolving...", "Resolviendo...")
          : tenantText("Resolve", "Resolver")}
      </span>
    </motion.button>
  );
}
