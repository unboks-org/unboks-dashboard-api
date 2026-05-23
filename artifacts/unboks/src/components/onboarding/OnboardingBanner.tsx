import { MessageCircle, Palette, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingStatus } from "@/hooks/use-onboarding-status";
import { cn } from "@/lib/utils";

export function OnboardingBanner() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError } = useOnboardingStatus();

  if (isLoading || isError || !data) return null;

  const showTrial = data.trialDaysRemaining !== null && data.trialDaysRemaining >= 0;
  const hasWhatsapp = Boolean(data.whatsappConnectUrl);
  if (!showTrial && !hasWhatsapp) return null;

  return (
    <section className="border-b border-[#e8eaed] bg-[#fbfcff] px-4 py-3 sm:px-6">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 rounded-[14px] border border-[#dfe8f8] bg-white px-4 py-3 shadow-[0_1px_8px_rgba(60,64,67,0.06)] sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f0fe] px-2.5 py-1 text-[12px] font-medium text-[#1a73e8]">
              <Sparkles className="h-3.5 w-3.5" />
              Onboarding
            </span>
            {showTrial && (
              <span className="rounded-full bg-[#f1f3f4] px-2.5 py-1 text-[12px] font-medium text-[#3c4043]">
                {data.trialDaysRemaining === 0
                  ? "Trial ends today"
                  : `${data.trialDaysRemaining} trial days left`}
              </span>
            )}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-[#5f6368]">
            Finish the two setup steps: connect WhatsApp and tune Marina's style.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasWhatsapp && (
            <a
              href={data.whatsappConnectUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#1a73e8]",
                "px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#1765c1]",
              )}
            >
              <MessageCircle className="h-4 w-4" />
              Connect WhatsApp
            </a>
          )}
          <button
            type="button"
            onClick={() => navigate("/settings?category=agent-personality")}
            className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-[#dadce0] bg-white px-3.5 py-2 text-[13px] font-medium text-[#3c4043] hover:bg-[#f8f9fa]"
          >
            <Palette className="h-4 w-4" />
            Tune Agent Style
          </button>
        </div>
      </div>
    </section>
  );
}
