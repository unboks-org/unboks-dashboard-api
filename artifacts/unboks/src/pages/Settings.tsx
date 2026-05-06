import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { Switch } from "@/components/ui/switch";
import { useConfig, useScheduleSlots, useScheduleSlotMutations } from "@/hooks/use-client-api";
import { useEmailSettings } from "@/hooks/use-email-settings";
import { useBookingsLabel } from "@/hooks/use-bookings-label";
import { useFeatureToggles } from "@/lib/feature-toggles";
import { useEnabledChannels, TOGGLEABLE_CHANNELS } from "@/hooks/use-enabled-channels";
import { loadSot, type SotBlock } from "@/data/sot";
import { getClientSlug, getApiBase } from "@/lib/tenant";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#f1f3f4] px-5 py-6">
      <div className="mb-4">
        <h3 className="text-[14px] font-semibold text-[#202124]">{title}</h3>
        {description && <p className="text-[13px] text-[#5f6368] mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange, disabled }: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-[14px] text-[#202124]">{label}</p>
        {description && <p className="text-[12px] text-[#5f6368] mt-0.5">{description}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="flex-shrink-0 data-[state=checked]:bg-[#1a73e8] data-[state=unchecked]:bg-[#dadce0]"
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-4 py-1.5 min-w-0">
      <span className="text-[13px] text-[#5f6368] w-36 flex-shrink-0">{label}</span>
      <span className="text-[13px] text-[#202124] font-mono bg-[#f6f8fc] px-2 py-0.5 rounded min-w-0 flex-1 break-all">{value}</span>
    </div>
  );
}

function SotCard({ block }: { block: SotBlock }) {
  return (
    <div className="bg-[#f6f8fc] rounded-lg p-4">
      <p className="text-[13px] font-semibold text-[#202124] mb-2">{block.title}</p>
      {block.content && (
        <p className="text-[13px] text-[#5f6368] leading-relaxed">{block.content}</p>
      )}
      {block.items && block.items.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {block.items.map((item, i) => (
            <li key={i} className="text-[13px] text-[#5f6368] flex gap-2">
              <span className="text-[#9aa0a6] select-none">–</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {block.subsections && block.subsections.length > 0 && (
        <div className="mt-3 space-y-3">
          {block.subsections.map((sub, i) => (
            <div key={i} className="border-t border-[#e8eaed] pt-3">
              <p className="text-[12px] font-medium text-[#5f6368] uppercase tracking-wide mb-1.5">
                {sub.title}
              </p>
              {sub.content && (
                <p className="text-[13px] text-[#5f6368] leading-relaxed">{sub.content}</p>
              )}
              {sub.items && sub.items.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {sub.items.map((item, j) => (
                    <li key={j} className="text-[13px] text-[#5f6368] flex gap-2">
                      <span className="text-[#9aa0a6] select-none">–</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { data: config, isLoading: configLoading } = useConfig();
  const { data: slots } = useScheduleSlots();
  const { save: saveSlots, isSaving: slotsSaving } = useScheduleSlotMutations();
  const { emailClient, setEmailClient } = useEmailSettings();
  const { label: bookingsLabel, setLabel: setBookingsLabel } = useBookingsLabel();
  const { toggles, setToggle } = useFeatureToggles();
  const { isChannelEnabled, toggleChannel } = useEnabledChannels();

  const [customLabel, setCustomLabel] = useState(bookingsLabel);
  const [labelSaved, setLabelSaved] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [sotOpen, setSotOpen] = useState(false);
  const [sotBlocks] = useState<SotBlock[]>(loadSot);

  return (
    <DashboardShell activeNav="settings" pageTitle="Settings">
      <div className="max-w-2xl min-w-0 overflow-x-hidden">

        {/* Client / System Info */}
        <Section title="Client & System" description="Current configuration for this workspace.">
          <div className="space-y-0.5">
            <InfoRow label="Client slug" value={getClientSlug()} />
            <InfoRow label="API endpoint" value={getApiBase()} />
            {configLoading && <p className="text-[12px] text-[#1a73e8] mt-2">Loading config…</p>}
            {config && (
              <>
                <InfoRow label="Client name" value={config.clientName ?? "—"} />
                <InfoRow
                  label="Platforms"
                  value={
                    Array.isArray(config.connectedPlatforms) && config.connectedPlatforms.length > 0
                      ? config.connectedPlatforms.join(", ")
                      : "No platforms connected yet"
                  }
                />
              </>
            )}
          </div>
        </Section>

        {/* Source of Truth */}
        <div className="border-b border-[#f1f3f4]">
          <button
            onClick={() => setSotOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-6 text-left"
          >
            <div>
              <p className="text-[14px] font-semibold text-[#202124]">Source of Truth</p>
              <p className="text-[13px] text-[#5f6368] mt-0.5">
                This is the information your AI uses to answer customers.
              </p>
            </div>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-[#5f6368] flex-shrink-0 transition-transform duration-200",
                sotOpen && "rotate-180"
              )}
            />
          </button>
          {sotOpen && (
            <div className="px-5 pb-6 space-y-3">
              {sotBlocks.map((block) => (
                <SotCard key={block.id} block={block} />
              ))}
            </div>
          )}
        </div>

        {/* Posting Schedule */}
        <Section title="Posting Schedule" description="Manage when Marina is active and posting.">
          {slots && slots.length > 0 ? (
            <div className="space-y-2">
              {slots.map((slot, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-[#f1f3f4] last:border-0">
                  <span className="text-[14px] text-[#202124] w-24">{slot.day}</span>
                  <span className="text-[13px] text-[#5f6368]">{slot.startTime} – {slot.endTime}</span>
                  <span className={cn(
                    "text-[11px] px-2 py-0.5 rounded-full",
                    slot.enabled ? "bg-[#e6f4ea] text-[#137333]" : "bg-[#f6f8fc] text-[#5f6368]",
                  )}>
                    {slot.enabled ? "Active" : "Off"}
                  </span>
                </div>
              ))}
              <button
                onClick={() => { saveSlots.mutate(slots); toast.success("Schedule saved"); }}
                disabled={slotsSaving}
                className="mt-3 text-[13px] text-[#1a73e8] hover:underline disabled:opacity-50"
              >
                {slotsSaving ? "Saving…" : "Save schedule"}
              </button>
            </div>
          ) : (
            <p className="text-[13px] text-[#9aa0a6]">
              Schedule not available — API connection required.
            </p>
          )}
        </Section>

        {/* Email Reply Preference */}
        <Section title="Email Reply Preference" description="Choose how email replies are opened.">
          <div className="flex gap-3">
            {(["gmail", "mailto"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setEmailClient(option)}
                className={cn(
                  "px-4 py-2 rounded-lg text-[13px] font-medium border transition-colors",
                  emailClient === option
                    ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                    : "border-[#dadce0] text-[#5f6368] hover:bg-[#f6f8fc]",
                )}
              >
                {option === "gmail" ? "Gmail" : "Default mail app"}
              </button>
            ))}
          </div>
        </Section>

        {/* Bookings Label */}
        <Section title="Orders Label" description="Customize what this section is called in the sidebar.">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              {["Bookings", "Orders"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setCustomLabel(opt)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-[13px] font-medium border transition-colors",
                    customLabel.trim() === opt
                      ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                      : "border-[#dadce0] text-[#5f6368] hover:bg-[#f6f8fc]",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Custom label…"
              className="flex-1 min-w-0 border border-[#dadce0] rounded-lg px-3 py-2 text-[13px] text-[#202124] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
            />
            <button
              onClick={() => {
                if (customLabel.trim().length === 0) return;
                setBookingsLabel(customLabel);
                setLabelSaved(true);
                window.setTimeout(() => setLabelSaved(false), 1800);
              }}
              disabled={customLabel.trim().length === 0 || customLabel.trim() === bookingsLabel}
              className={cn(
                "px-4 py-2 rounded-lg text-[13px] font-medium border transition-colors",
                customLabel.trim().length === 0 || customLabel.trim() === bookingsLabel
                  ? "border-[#dadce0] text-[#9aa0a6] cursor-not-allowed"
                  : "border-[#1a73e8] bg-[#1a73e8] text-white hover:bg-[#1765c1]",
              )}
            >
              Save
            </button>
            {labelSaved && (
              <span className="text-[12px] text-[#34a853]">Saved</span>
            )}
          </div>
        </Section>

        {/* Channels */}
        <div className="border-b border-[#f1f3f4]">
          <button
            onClick={() => setChannelsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-6 text-left"
          >
            <div>
              <p className="text-[14px] font-semibold text-[#202124]">Channels</p>
              <p className="text-[13px] text-[#5f6368] mt-0.5">Show or hide channels across the dashboard.</p>
            </div>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-[#5f6368] flex-shrink-0 transition-transform duration-200",
                channelsOpen && "rotate-180"
              )}
            />
          </button>
          {channelsOpen && (
            <div className="px-5 pb-6 space-y-1">
              {TOGGLEABLE_CHANNELS.map((ch) => (
                <ToggleRow
                  key={ch}
                  label={ch}
                  checked={isChannelEnabled(ch)}
                  onChange={() => toggleChannel(ch)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Feature Toggles */}
        <Section title="Feature Visibility" description="Show or hide sections in the sidebar.">
          <div className="space-y-1">
            <ToggleRow
              label="AI Suggest Reply"
              description="Show AI reply suggestions in conversations."
              checked={toggles.aiSuggestReply}
              onChange={(v) => setToggle("aiSuggestReply", v)}
            />
            <ToggleRow
              label="Email Notifications"
              description="Receive email summaries for escalations."
              checked={toggles.emailNotifications}
              onChange={(v) => setToggle("emailNotifications", v)}
            />
          </div>
        </Section>

      </div>
    </DashboardShell>
  );
}
