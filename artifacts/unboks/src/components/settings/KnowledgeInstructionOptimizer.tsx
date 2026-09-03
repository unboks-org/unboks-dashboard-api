import { useEffect, useState } from "react";
import { Check, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  improveInfoUpdateInstruction,
  type InfoUpdateImproveResponse,
} from "@/lib/api";
import { tenantText } from "@/lib/tenant-ui";
import { cn } from "@/lib/utils";

interface KnowledgeInstructionOptimizerProps {
  text: string;
  type: string;
  startDate?: string;
  endDate?: string;
  disabled?: boolean;
  onApply: (text: string) => void;
}

interface ImprovementReview extends InfoUpdateImproveResponse {
  originalText: string;
}

function ScoreBadge({ score, improved }: { score: number; improved?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[54px] items-center justify-center rounded-full px-2.5 py-1 text-[12px] font-semibold",
        improved
          ? "bg-[#dff7ec] text-[#087a55]"
          : "bg-[#fff1dc] text-[#9a5b00]",
      )}
    >
      {score}/10
    </span>
  );
}

export function KnowledgeInstructionOptimizer({
  text,
  type,
  startDate,
  endDate,
  disabled = false,
  onApply,
}: KnowledgeInstructionOptimizerProps) {
  const [improving, setImproving] = useState(false);
  const [review, setReview] = useState<ImprovementReview | null>(null);

  useEffect(() => {
    if (!text.trim()) setReview(null);
  }, [text]);

  const handleImprove = async () => {
    const originalText = text.trim();
    if (!originalText) {
      toast.error("Escribe una instrucción antes de mejorarla.");
      return;
    }
    setImproving(true);
    try {
      const result = await improveInfoUpdateInstruction({
        text: originalText,
        type,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setReview({ ...result, originalText });
      onApply(result.improvedText);
      toast.success("Instrucción mejorada. Revísala antes de guardarla.");
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : "No se ha podido mejorar la instrucción.";
      toast.error(message);
    } finally {
      setImproving(false);
    }
  };

  const editedAfterImprovement = Boolean(
    review && text.trim() !== review.improvedText.trim(),
  );

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleImprove}
        disabled={disabled || improving || !text.trim()}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#c9bdf8] bg-[#f4f0ff] px-3 py-2 text-[12px] font-semibold text-[#5b3fc4] shadow-sm transition-colors hover:border-[#a995f0] hover:bg-[#eee8ff] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {improving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {improving
          ? tenantText("Improving instruction...", "Mejorando instrucción...")
          : tenantText("Improve instruction with AI", "Mejorar instrucción con IA")}
      </button>

      {review && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-[#b9ead6] bg-gradient-to-br from-[#f2fbf7] to-[#f7f4ff] p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#176b54]">
              <Check className="h-4 w-4" />
              {tenantText("AI draft ready", "Borrador profesional listo")}
            </span>
            <div className="ml-auto flex items-center gap-2 text-[11px] text-[#5f6368]">
              <span>{tenantText("Original", "Original")}</span>
              <ScoreBadge score={review.originalScore} />
              <span aria-hidden="true">→</span>
              <span>{tenantText("Improved", "Mejorada")}</span>
              <ScoreBadge score={review.improvedScore} improved />
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-[#5f6368]">
            {editedAfterImprovement
              ? tenantText(
                  "You edited the AI draft. Review the final text and save when ready.",
                  "Has editado el borrador. Revisa el texto final y guárdalo cuando esté listo.",
                )
              : tenantText(
                  "The field now contains the improved draft. Nothing has been saved yet.",
                  "El campo contiene ahora la versión mejorada. Todavía no se ha guardado nada.",
                )}
          </p>
          <button
            type="button"
            onClick={() => {
              onApply(review.originalText);
              setReview(null);
            }}
            disabled={disabled || improving}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-[#5b3fc4] hover:bg-[#ece6ff] disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {tenantText("Restore original", "Restaurar original")}
          </button>
        </div>
      )}
    </div>
  );
}
