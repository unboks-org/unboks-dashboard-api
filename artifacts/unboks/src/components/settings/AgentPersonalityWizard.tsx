import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAgentPersonality } from "@/hooks/use-agent-personality";
import type { AgentPersonalitySettings } from "@/lib/api";
import { cn } from "@/lib/utils";

const OPTIONS = {
  tone: ["Human and direct", "Warm and calm", "Professional", "Light and casual"],
  formality: ["Balanced", "Casual", "Formal"],
  empathy: ["Practical empathy", "Extra patient", "Brief and factual"],
  appointmentStyle: [
    "Answer first, suggest appointments only when useful",
    "Offer consultation after basic context",
    "Drive toward booking quickly",
  ],
};

const EMPTY: AgentPersonalitySettings = {
  tone: "Human and direct",
  formality: "Balanced",
  empathy: "Practical empathy",
  appointmentStyle: "Answer first, suggest appointments only when useful",
  instructions: "",
  examples: [],
};

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-[#3c4043]">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                active
                  ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                  : "border-[#dadce0] bg-white text-[#5f6368] hover:bg-[#f8f9fa]",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AgentPersonalityWizard() {
  const {
    settings,
    isLoading,
    loadError,
    generateExamples,
    isGenerating,
    save,
    isSaving,
  } = useAgentPersonality();
  const [draft, setDraft] = useState<AgentPersonalitySettings>(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setDraft({
        ...EMPTY,
        ...settings,
        examples: settings.examples ?? [],
      });
    }
  }, [settings]);

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 1800);
    return () => window.clearTimeout(t);
  }, [saved]);

  const canSave = useMemo(
    () =>
      Boolean(
        draft.tone.trim() ||
          draft.formality.trim() ||
          draft.empathy.trim() ||
          draft.appointmentStyle.trim() ||
          draft.instructions.trim(),
      ),
    [draft],
  );

  const handleGenerate = async () => {
    try {
      const result = await generateExamples(draft);
      if (result.examples.length === 0) {
        toast.error("Claude did not return examples.");
        return;
      }
      setDraft((current) => ({ ...current, examples: result.examples }));
      toast.success("Examples generated with Claude.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate examples.");
    }
  };

  const handleSave = async () => {
    try {
      const result = await save(draft);
      setDraft({ ...EMPTY, ...result, examples: result.examples ?? [] });
      setSaved(true);
      if (result.bridgeSaved === false) {
        toast.warning("Saved locally. Nr3 bridge did not confirm the update.");
      } else {
        toast.success("Style saved and activated.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save style.");
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-[20px] border border-[#e8eaed] bg-white px-5 py-5 text-[14px] text-[#5f6368]">
        Loading Agent style...
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-[#e8eaed] bg-white shadow-sm">
      <header className="border-b border-[#e8eaed] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e8f0fe] text-[#1a73e8]">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-[15px] font-medium text-[#202124]">
              Agent Personality Wizard
            </h3>
            <p className="mt-0.5 text-[13px] text-[#5f6368]">
              Use Claude to draft examples, then activate the style for Marina.
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        {loadError && (
          <div className="rounded-md border border-[#f6caca] bg-[#fce8e6] px-3 py-2 text-[12px] text-[#a50e0e]">
            Could not load current style: {loadError.message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Segmented
            label="Tone"
            value={draft.tone}
            options={OPTIONS.tone}
            onChange={(tone) => setDraft((d) => ({ ...d, tone }))}
          />
          <Segmented
            label="Formality"
            value={draft.formality}
            options={OPTIONS.formality}
            onChange={(formality) => setDraft((d) => ({ ...d, formality }))}
          />
          <Segmented
            label="Empathy"
            value={draft.empathy}
            options={OPTIONS.empathy}
            onChange={(empathy) => setDraft((d) => ({ ...d, empathy }))}
          />
          <Segmented
            label="Appointment behavior"
            value={draft.appointmentStyle}
            options={OPTIONS.appointmentStyle}
            onChange={(appointmentStyle) =>
              setDraft((d) => ({ ...d, appointmentStyle }))
            }
          />
        </div>

        <label className="block">
          <span className="mb-2 block text-[13px] font-medium text-[#3c4043]">
            Operator instructions
          </span>
          <textarea
            value={draft.instructions}
            onChange={(e) =>
              setDraft((d) => ({ ...d, instructions: e.target.value }))
            }
            rows={6}
            placeholder="Example: Answer the client's question first. Do not push appointments in every message. Sound like a capable office assistant, not a chatbot."
            className="w-full resize-y rounded-[12px] border border-[#dadce0] bg-white px-3 py-2.5 text-[14px] leading-relaxed text-[#202124] outline-none placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
          />
        </label>

        <div className="rounded-[14px] border border-[#e8eaed] bg-[#fbfbfd] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-[#3c4043]">
              Claude example replies
            </p>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || isSaving}
              className="inline-flex items-center gap-2 rounded-[10px] border border-[#dadce0] bg-white px-3 py-2 text-[13px] font-medium text-[#3c4043] hover:bg-[#f8f9fa] disabled:opacity-60"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate examples
            </button>
          </div>
          {draft.examples.length === 0 ? (
            <p className="text-[13px] text-[#9aa0a6]">
              Generate examples after adding your preferred style.
            </p>
          ) : (
            <div className="space-y-2">
              {draft.examples.map((example, index) => (
                <textarea
                  key={index}
                  value={example}
                  onChange={(e) => {
                    const next = [...draft.examples];
                    next[index] = e.target.value;
                    setDraft((d) => ({ ...d, examples: next }));
                  }}
                  rows={3}
                  className="w-full resize-y rounded-[10px] border border-[#e8eaed] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#3c4043] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-[#e8eaed] bg-[#fbfbfd] px-5 py-4 sm:px-6">
        <span
          className={cn(
            "text-[13px] text-[#137333] transition-opacity",
            saved ? "opacity-100" : "opacity-0",
          )}
        >
          Saved
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className="inline-flex items-center gap-2 rounded-[10px] bg-[#1a73e8] px-4 py-2.5 text-[13px] font-medium text-white hover:bg-[#1765c1] disabled:cursor-not-allowed disabled:bg-[#c8d4e6]"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save & Activate This Style
        </button>
      </footer>
    </section>
  );
}
