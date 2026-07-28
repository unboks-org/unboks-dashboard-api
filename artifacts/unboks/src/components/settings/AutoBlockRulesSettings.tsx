import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  useAutoBlockSettings,
  useSaveAutoBlockSettings,
} from "@/hooks/use-auto-block-settings";
import type { AutoBlockSettings } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { cn } from "@/lib/utils";
import { tenantText } from "@/lib/tenant-ui";

const ZERO_RULES: Array<{
  key: keyof AutoBlockSettings["zero_tolerance"];
  label: string;
  spanish: string;
}> = [
  { key: "hate_speech", label: "Block immediately for racial slurs / hate speech", spanish: "Bloquear inmediatamente por insultos racistas o discurso de odio" },
  { key: "severe_insult", label: "Block immediately for severe insults or personal abuse", spanish: "Bloquear inmediatamente por insultos graves o ataques personales" },
  { key: "threat", label: "Block immediately for threats or intimidation", spanish: "Bloquear inmediatamente por amenazas o intimidación" },
  { key: "sexual_harassment", label: "Block immediately for sexual harassment", spanish: "Bloquear inmediatamente por acoso sexual" },
  { key: "fraud_scam", label: "Block immediately for fraud/scam behavior", spanish: "Bloquear inmediatamente por fraude o estafa" },
  { key: "severe_abuse", label: "Block immediately for other severe abusive behavior", spanish: "Bloquear inmediatamente por otras conductas abusivas graves" },
];

function cloneSettings(settings: AutoBlockSettings): AutoBlockSettings {
  return {
    ...settings,
    zero_tolerance: { ...settings.zero_tolerance },
    repeated_profanity: { ...settings.repeated_profanity },
  };
}

export function AutoBlockRulesSettings() {
  const { data, isLoading, isError, error } = useAutoBlockSettings();
  const save = useSaveAutoBlockSettings();

  const update = async (mutate: (draft: AutoBlockSettings) => void) => {
    if (!data) return;
    const draft = cloneSettings(data);
    mutate(draft);
    try {
      await save.mutateAsync(draft);
      toast.success(tenantText("Auto-block rules saved", "Reglas de bloqueo automático guardadas"));
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message || `Backend returned ${err.status}.`
          : err instanceof Error
            ? err.message
            : tenantText(
                "Couldn't save auto-block rules.",
                "No se pudieron guardar las reglas de bloqueo automático.",
              );
      toast.error(
        tenantText(
          "Couldn't save auto-block rules",
          "No se pudieron guardar las reglas de bloqueo automático",
        ),
        { description: msg },
      );
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white">
      <div className="border-b border-[#f1f3f4] px-5 py-4 sm:px-6">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-[#202124]">
          <ShieldAlert className="h-4 w-4 text-[#5f6368]" aria-hidden="true" />
          {tenantText("Auto-Block Rules", "Reglas de bloqueo automático")}
        </h3>
        <p className="mt-1 text-[13px] leading-5 text-[#5f6368]">
          {tenantText(
            "Automatically block customers who abuse your team or AI assistant. Serious abuse can be blocked immediately. Repeated profanity can be blocked after a threshold.",
            "Bloquea automáticamente a quienes ataquen a tu equipo o al asistente de IA. Los abusos graves pueden bloquearse de inmediato y los insultos repetidos, al superar un límite.",
          )}
        </p>
      </div>

      <div className="px-5 py-4 sm:px-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-[#5f6368]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {tenantText("Loading auto-block rules…", "Cargando reglas de bloqueo automático…")}
          </div>
        ) : isError || !data ? (
          <p className="text-[13px] text-[#c5221f]">
            {error instanceof Error && error.message
              ? tenantText(
                  `Couldn't load auto-block rules: ${error.message}`,
                  `No se pudieron cargar las reglas de bloqueo automático: ${error.message}`,
                )
              : tenantText(
                  "Couldn't load auto-block rules.",
                  "No se pudieron cargar las reglas de bloqueo automático.",
                )}
          </p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[#edf0f3] bg-[#fbfcfe] px-4 py-3">
              <div>
                <p className="text-[13px] font-medium text-[#202124]">
                  {tenantText("Auto-block enabled", "Bloqueo automático activado")}
                </p>
                <p className="text-[12px] text-[#5f6368]">
                  {tenantText(
                    "Blocks are logged and escalated for human review.",
                    "Los bloqueos se registran para que una persona pueda revisarlos.",
                  )}
                </p>
              </div>
              <Switch
                checked={data.enabled}
                disabled={save.isPending}
                onCheckedChange={(checked) => update((draft) => { draft.enabled = checked; })}
                aria-label={tenantText(
                  "Auto-block enabled",
                  "Bloqueo automático activado",
                )}
              />
            </div>

            <div>
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5f6368]">
                {tenantText("Zero tolerance", "Tolerancia cero")}
              </p>
              <div className="divide-y divide-[#f1f3f4] rounded-xl border border-[#edf0f3]">
                {ZERO_RULES.map((rule) => (
                  <label
                    key={rule.key}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-4 py-3 text-[13px] text-[#202124]",
                      save.isPending && "cursor-wait opacity-70",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={data.zero_tolerance[rule.key]}
                      disabled={save.isPending}
                      onChange={(e) => update((draft) => {
                        draft.zero_tolerance[rule.key] = e.target.checked;
                      })}
                      className="h-4 w-4 rounded border-[#cfd4dc] text-[#1a73e8] focus:ring-[#1a73e8]/30"
                    />
                    <span>{tenantText(rule.label, rule.spanish)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#edf0f3] px-4 py-3">
              <label className="flex items-center gap-3 text-[13px] font-medium text-[#202124]">
                <input
                  type="checkbox"
                  checked={data.repeated_profanity.enabled}
                  disabled={save.isPending}
                  onChange={(e) => update((draft) => {
                    draft.repeated_profanity.enabled = e.target.checked;
                  })}
                  className="h-4 w-4 rounded border-[#cfd4dc] text-[#1a73e8] focus:ring-[#1a73e8]/30"
                />
                {tenantText(
                  "Block for repeated profanity / bad words",
                  "Bloquear por insultos o lenguaje ofensivo repetido",
                )}
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-[#5f6368]">
                <span>{tenantText("Block after", "Bloquear después de")}</span>
                {[2, 3, 5].map((threshold) => (
                  <button
                    key={threshold}
                    type="button"
                    disabled={save.isPending || !data.repeated_profanity.enabled}
                    onClick={() => update((draft) => {
                      draft.repeated_profanity.threshold = threshold as 2 | 3 | 5;
                    })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[12px] font-medium",
                      data.repeated_profanity.threshold === threshold
                        ? "border-[#1a73e8] bg-[#e8f0fe] text-[#174ea6]"
                        : "border-[#dadce0] bg-white text-[#5f6368]",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                  >
                    {threshold} {tenantText("messages", "mensajes")}
                  </button>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-3 text-[13px] text-[#202124]">
                <input
                  type="checkbox"
                  checked={data.repeated_profanity.warn_before_block}
                  disabled={save.isPending || !data.repeated_profanity.enabled}
                  onChange={(e) => update((draft) => {
                    draft.repeated_profanity.warn_before_block = e.target.checked;
                  })}
                  className="h-4 w-4 rounded border-[#cfd4dc] text-[#1a73e8] focus:ring-[#1a73e8]/30"
                />
                {tenantText(
                  "Warn before blocking for repeated profanity",
                  "Avisar antes de bloquear por lenguaje ofensivo repetido",
                )}
              </label>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
