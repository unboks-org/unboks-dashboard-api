import { useRef, useState, ChangeEvent } from "react";
import { ChevronDown, X } from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { Switch } from "@/components/ui/switch";
import { useEmailSettings } from "@/hooks/use-email-settings";
import { useBookingsLabel } from "@/hooks/use-bookings-label";
import { useEscalationNotificationPrefs, type NotifyChannelKey } from "@/hooks/use-escalation-notification-preferences";
import { useEnabledChannels, TOGGLEABLE_CHANNELS } from "@/hooks/use-enabled-channels";
import { useAccountSettings, type AccountSettings } from "@/hooks/use-account-settings";
import { useYourInfoUpdates, UPDATE_TYPES, type YourInfoUpdateType } from "@/hooks/use-your-info-updates";
import { loadSot, type SotBlock } from "@/data/sot";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

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
  const { emailClient, setEmailClient } = useEmailSettings();
  const { label: bookingsLabel, setLabel: setBookingsLabel } = useBookingsLabel();
  const { prefs: notifyPrefs, save: saveNotifyPrefs } = useEscalationNotificationPrefs();
  const [notifyDraft, setNotifyDraft] = useState(notifyPrefs);
  const [notifySaved, setNotifySaved] = useState(false);
  const { isChannelEnabled, toggleChannel } = useEnabledChannels();

  const [customLabel, setCustomLabel] = useState(bookingsLabel);
  const [labelSaved, setLabelSaved] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [sotOpen, setSotOpen] = useState(false);
  const [sotBlocks] = useState<SotBlock[]>(loadSot);

  // Account settings (local v1)
  const { settings: account, save: saveAccount } = useAccountSettings();
  const [accountDraft, setAccountDraft] = useState<AccountSettings>(account);
  const [accountSaved, setAccountSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast.error("Logo must be a PNG, JPG, WebP or SVG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (dataUrl) setAccountDraft((d) => ({ ...d, logoDataUrl: dataUrl }));
    };
    reader.onerror = () => toast.error("Could not read that image.");
    reader.readAsDataURL(file);
  };

  // Your Info Updates (local v1)
  const { updates, addUpdate, setActive, removeUpdate } = useYourInfoUpdates();
  const [updateText, setUpdateText] = useState("");
  const [updateType, setUpdateType] = useState<YourInfoUpdateType>("general");
  const [updateStart, setUpdateStart] = useState("");
  const [updateEnd, setUpdateEnd] = useState("");

  return (
    <DashboardShell activeNav="settings" pageTitle="Settings">
      <div className="max-w-2xl min-w-0 overflow-x-hidden">

        {/* Account Settings */}
        <Section title="Account Settings" description="Your business identity used in this dashboard.">
          <div className="space-y-3">
            {([
              { key: "businessName", label: "Business name", type: "text", placeholder: "Acme Co." },
              { key: "contactEmail", label: "Contact email", type: "email", placeholder: "hello@acme.com" },
              { key: "phone", label: "Phone number", type: "tel", placeholder: "+1 555 123 4567" },
              { key: "website", label: "Website", type: "url", placeholder: "https://acme.com" },
            ] as const).map((field) => (
              <label key={field.key} className="block">
                <span className="text-[12px] text-[#5f6368]">{field.label}</span>
                <input
                  type={field.type}
                  value={accountDraft[field.key] ?? ""}
                  onChange={(e) =>
                    setAccountDraft((d) => ({ ...d, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                  className="mt-1 w-full min-w-0 border border-[#dadce0] rounded-lg px-3 py-2 text-[13px] text-[#202124] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                />
              </label>
            ))}

            <div className="pt-2">
              <span className="text-[12px] text-[#5f6368]">Logo</span>
              <div className="mt-1 flex items-start gap-3">
                <div className="grid h-20 w-20 flex-shrink-0 place-items-center overflow-hidden rounded-lg border border-[#e8eaed] bg-[#f6f8fc]">
                  {accountDraft.logoDataUrl ? (
                    <img
                      src={accountDraft.logoDataUrl}
                      alt="Logo preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[11px] text-[#9aa0a6]">No logo</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="rounded-lg border border-[#dadce0] px-3 py-1.5 text-[13px] text-[#3c4043] hover:bg-[#f6f8fc]"
                    >
                      Upload logo
                    </button>
                    {accountDraft.logoDataUrl && (
                      <button
                        type="button"
                        onClick={() => setAccountDraft((d) => ({ ...d, logoDataUrl: undefined }))}
                        className="rounded-lg border border-[#dadce0] px-3 py-1.5 text-[13px] text-[#5f6368] hover:bg-[#f6f8fc]"
                      >
                        Remove
                      </button>
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept={ALLOWED_LOGO_TYPES.join(",")}
                      onChange={handleLogoSelect}
                      className="hidden"
                    />
                  </div>
                  <p className="mt-2 text-[12px] text-[#5f6368]">
                    This logo is used in your dashboard. PNG, JPG, WebP or SVG. Max 2 MB.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  saveAccount(accountDraft);
                  setAccountSaved(true);
                  window.setTimeout(() => setAccountSaved(false), 1800);
                }}
                className="px-4 py-2 rounded-lg text-[13px] font-medium border border-[#1a73e8] bg-[#1a73e8] text-white hover:bg-[#1765c1] transition-colors"
              >
                Save
              </button>
              {accountSaved && <span className="text-[12px] text-[#34a853]">Saved</span>}
            </div>
            <p className="text-[12px] text-[#5f6368]">
              Saved for dashboard setup. Public website and AI usage will be connected by the Unboks team.
            </p>
          </div>
        </Section>

        {/* Your Info Updates */}
        <Section
          title="Your Info Updates"
          description="Add temporary information, offers, holidays, or special notes your AI should know about."
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {UPDATE_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setUpdateType(t.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] transition-colors",
                    updateType === t.value
                      ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                      : "border-[#dadce0] text-[#5f6368] hover:bg-[#f6f8fc]",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <textarea
              value={updateText}
              onChange={(e) => setUpdateText(e.target.value)}
              rows={3}
              placeholder="Example: We are closed on Christmas Day, but open again on December 26."
              className="w-full min-w-0 resize-y border border-[#dadce0] rounded-lg px-3 py-2 text-[13px] text-[#202124] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
            />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-[12px] text-[#5f6368]">Start date (optional)</span>
                <input
                  type="date"
                  value={updateStart}
                  onChange={(e) => setUpdateStart(e.target.value)}
                  className="mt-1 w-full min-w-0 border border-[#dadce0] rounded-lg px-3 py-2 text-[13px] text-[#202124] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                />
              </label>
              <label className="block">
                <span className="text-[12px] text-[#5f6368]">End date (optional)</span>
                <input
                  type="date"
                  value={updateEnd}
                  onChange={(e) => setUpdateEnd(e.target.value)}
                  className="mt-1 w-full min-w-0 border border-[#dadce0] rounded-lg px-3 py-2 text-[13px] text-[#202124] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                />
              </label>
            </div>

            <div>
              <button
                type="button"
                onClick={() => {
                  const text = updateText.trim();
                  if (!text) {
                    toast.error("Write a short note before adding the update.");
                    return;
                  }
                  addUpdate({
                    type: updateType,
                    text,
                    startDate: updateStart || undefined,
                    endDate: updateEnd || undefined,
                  });
                  setUpdateText("");
                  setUpdateStart("");
                  setUpdateEnd("");
                  setUpdateType("general");
                  toast.success("Update added.");
                }}
                className="px-4 py-2 rounded-lg text-[13px] font-medium border border-[#1a73e8] bg-[#1a73e8] text-white hover:bg-[#1765c1] transition-colors"
              >
                Add update
              </button>
            </div>

            {updates.length === 0 ? (
              <p className="text-[12px] text-[#9aa0a6]">No updates yet.</p>
            ) : (
              <ul className="space-y-2 pt-1">
                {updates.map((u) => {
                  const typeLabel = UPDATE_TYPES.find((t) => t.value === u.type)?.label ?? u.type;
                  return (
                    <li
                      key={u.id}
                      className={cn(
                        "rounded-lg border border-[#e8eaed] bg-white p-3",
                        !u.active && "opacity-60",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className="inline-flex items-center rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[11px] font-medium text-[#3c4043]">
                          {typeLabel}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                            u.active
                              ? "bg-[#e6f4ea] text-[#137333]"
                              : "bg-[#f6f8fc] text-[#5f6368]",
                          )}
                        >
                          {u.active ? "Active" : "Inactive"}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeUpdate(u.id)}
                          aria-label="Remove update"
                          className="ml-auto grid h-6 w-6 place-items-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-[13px] text-[#202124]">
                        {u.text}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5f6368]">
                        <span>
                          Added{" "}
                          {new Date(u.createdAt).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        {u.startDate && <span>From {u.startDate}</span>}
                        {u.endDate && <span>Until {u.endDate}</span>}
                        <button
                          type="button"
                          onClick={() => setActive(u.id, !u.active)}
                          className="ml-auto text-[#1a73e8] hover:underline"
                        >
                          {u.active ? "Mark inactive" : "Reactivate"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="text-[12px] text-[#5f6368]">
              Saved for dashboard setup. AI usage will be connected by the Unboks team.
            </p>
          </div>
        </Section>

        {/* Your Info (formerly "Source of Truth") */}
        <div className="border-b border-[#f1f3f4]">
          <button
            onClick={() => setSotOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-6 text-left"
          >
            <div>
              <p className="text-[14px] font-semibold text-[#202124]">Your Info</p>
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

        {/* Escalation Notifications */}
        <Section
          title="Escalation Notifications"
          description="Choose where urgent escalation alerts should be sent."
        >
          <div className="space-y-3">
            {/* Email — mandatory */}
            <div className="flex items-center justify-between gap-4 py-2 border-b border-[#f1f3f4]">
              <div className="min-w-0">
                <p className="text-[14px] text-[#202124]">Email</p>
                <p className="text-[12px] text-[#5f6368] mt-0.5 break-all">
                  Always enabled · Default account email
                </p>
              </div>
              <span className="text-[12px] text-[#5f6368] flex-shrink-0">Default</span>
            </div>

            {/* Optional channels */}
            {([
              { key: "whatsapp", label: "WhatsApp", placeholder: "+599 9 123 4567" },
              { key: "messenger", label: "Messenger", placeholder: "username or profile link" },
              { key: "telegram", label: "Telegram", placeholder: "@username or phone number" },
            ] as { key: NotifyChannelKey; label: string; placeholder: string }[]).map((row) => {
              const pref = notifyDraft[row.key];
              return (
                <div key={row.key} className="space-y-2">
                  <ToggleRow
                    label={row.label}
                    checked={pref.enabled}
                    onChange={(v) =>
                      setNotifyDraft({
                        ...notifyDraft,
                        [row.key]: { ...pref, enabled: v },
                      })
                    }
                  />
                  {pref.enabled && (
                    <input
                      type="text"
                      value={pref.destination}
                      onChange={(e) =>
                        setNotifyDraft({
                          ...notifyDraft,
                          [row.key]: { ...pref, destination: e.target.value },
                        })
                      }
                      placeholder={row.placeholder}
                      className="w-full min-w-0 border border-[#dadce0] rounded-lg px-3 py-2 text-[13px] text-[#202124] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                    />
                  )}
                </div>
              );
            })}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  saveNotifyPrefs(notifyDraft);
                  setNotifySaved(true);
                  window.setTimeout(() => setNotifySaved(false), 1800);
                }}
                className="px-4 py-2 rounded-lg text-[13px] font-medium border border-[#1a73e8] bg-[#1a73e8] text-white hover:bg-[#1765c1] transition-colors"
              >
                Save
              </button>
              {notifySaved && (
                <span className="text-[12px] text-[#34a853]">Saved</span>
              )}
            </div>

            <p className="text-[12px] text-[#5f6368] pt-1">
              Escalation delivery will use the channels connected by your Unboks setup.
            </p>
          </div>
        </Section>

      </div>
    </DashboardShell>
  );
}
