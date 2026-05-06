import { useEffect, useMemo, useRef, useState, ChangeEvent } from "react";
import {
  Bell,
  Building2,
  ChevronDown,
  MessageSquare,
  Sparkles,
  SlidersHorizontal,
  X,
} from "lucide-react";
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

type CategoryId = "workspace" | "your-info" | "channels" | "escalation" | "preferences";

const CATEGORIES: {
  id: CategoryId;
  label: string;
  description: string;
  icon: typeof Building2;
}[] = [
  {
    id: "workspace",
    label: "Workspace",
    description: "Manage the basic details shown in your Unboks workspace.",
    icon: Building2,
  },
  {
    id: "your-info",
    label: "Your Info",
    description: "Add information your AI should know when replying to customers.",
    icon: Sparkles,
  },
  {
    id: "channels",
    label: "Channels",
    description: "Choose which channels appear in your dashboard.",
    icon: MessageSquare,
  },
  {
    id: "escalation",
    label: "Escalation Alerts",
    description: "Choose where urgent escalation alerts should be sent.",
    icon: Bell,
  },
  {
    id: "preferences",
    label: "Labels & Preferences",
    description: "Customize how your dashboard looks and opens replies.",
    icon: SlidersHorizontal,
  },
];

// ---------- Reusable presentation primitives ----------

function CategoryHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[18px] font-semibold tracking-tight text-[#202124]">{title}</h2>
      <p className="mt-1 text-[13px] text-[#5f6368]">{description}</p>
    </div>
  );
}

function Card({
  title,
  description,
  footer,
  children,
}: {
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white">
      {(title || description) && (
        <header className="border-b border-[#f1f3f4] px-5 py-4 sm:px-6">
          {title && <h3 className="text-[14px] font-semibold text-[#202124]">{title}</h3>}
          {description && <p className="mt-0.5 text-[13px] text-[#5f6368]">{description}</p>}
        </header>
      )}
      <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
      {footer && (
        <footer className="flex items-center justify-end gap-3 border-t border-[#f1f3f4] bg-[#fafbfc] px-5 py-3 sm:px-6">
          {footer}
        </footer>
      )}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[12px] font-medium text-[#5f6368]">{children}</span>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "mt-1 w-full min-w-0 rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-[13px] text-[#202124] outline-none transition-colors",
        "placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]",
        props.className,
      )}
    />
  );
}

function PrimaryButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cn(
        "rounded-lg bg-[#1a73e8] px-4 py-2 text-[13px] font-medium text-white transition-colors",
        "hover:bg-[#1765c1] disabled:cursor-not-allowed disabled:bg-[#c8d4e6]",
        rest.className,
      )}
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cn(
        "rounded-lg border border-[#dadce0] bg-white px-3 py-1.5 text-[13px] text-[#3c4043] transition-colors hover:bg-[#f6f8fc]",
        rest.className,
      )}
    >
      {children}
    </button>
  );
}

function SavedFlash({ visible }: { visible: boolean }) {
  return (
    <span
      className={cn(
        "text-[12px] text-[#137333] transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
      )}
      aria-live="polite"
    >
      Saved
    </span>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-[14px] text-[#202124]">{label}</p>
        {description && <p className="mt-0.5 text-[12px] text-[#5f6368]">{description}</p>}
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

// ---------- Your Info read-only knowledge cards ----------

function SotKnowledgeCard({ block }: { block: SotBlock }) {
  return (
    <div className="rounded-xl border border-[#e8eaed] bg-white p-4">
      <p className="mb-2 text-[13px] font-semibold text-[#202124]">{block.title}</p>
      {block.content && (
        <p className="text-[13px] leading-relaxed text-[#5f6368]">{block.content}</p>
      )}
      {block.items && block.items.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2 text-[13px] text-[#5f6368]">
              <span className="select-none text-[#9aa0a6]">–</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {block.subsections && block.subsections.length > 0 && (
        <div className="mt-3 space-y-3">
          {block.subsections.map((sub, i) => (
            <div key={i} className="border-t border-[#e8eaed] pt-3">
              <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-[#5f6368]">
                {sub.title}
              </p>
              {sub.content && (
                <p className="text-[13px] leading-relaxed text-[#5f6368]">{sub.content}</p>
              )}
              {sub.items && sub.items.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {sub.items.map((item, j) => (
                    <li key={j} className="flex gap-2 text-[13px] text-[#5f6368]">
                      <span className="select-none text-[#9aa0a6]">–</span>
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

// =====================================================
// Page
// =====================================================

export default function Settings() {
  const [active, setActive] = useState<CategoryId>("workspace");

  // Hooks (unchanged behaviour) -------------------------
  const { emailClient, setEmailClient } = useEmailSettings();
  const { label: bookingsLabel, setLabel: setBookingsLabel } = useBookingsLabel();
  const { prefs: notifyPrefs, save: saveNotifyPrefs } = useEscalationNotificationPrefs();
  const { isChannelEnabled, toggleChannel } = useEnabledChannels();
  const { settings: account, save: saveAccount } = useAccountSettings();
  const { updates, addUpdate, setActive: setUpdateActive, removeUpdate } = useYourInfoUpdates();

  const sotBlocks = useMemo<SotBlock[]>(() => loadSot(), []);

  // Workspace draft -------------------------------------
  const [accountDraft, setAccountDraft] = useState<AccountSettings>(account);
  const [accountSaved, setAccountSaved] = useState(false);
  const accountDirty = useMemo(
    () => JSON.stringify(account) !== JSON.stringify(accountDraft),
    [account, accountDraft],
  );
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

  // Your Info Updates composer state --------------------
  const [updateText, setUpdateText] = useState("");
  const [updateType, setUpdateType] = useState<YourInfoUpdateType>("general");
  const [updateStart, setUpdateStart] = useState("");
  const [updateEnd, setUpdateEnd] = useState("");

  // Escalation Alerts draft -----------------------------
  const [notifyDraft, setNotifyDraft] = useState(notifyPrefs);
  const [notifySaved, setNotifySaved] = useState(false);
  const notifyDirty = useMemo(
    () => JSON.stringify(notifyPrefs) !== JSON.stringify(notifyDraft),
    [notifyPrefs, notifyDraft],
  );

  // Labels & Preferences --------------------------------
  const [customLabel, setCustomLabel] = useState(bookingsLabel);
  const [labelSaved, setLabelSaved] = useState(false);
  const labelDirty = customLabel.trim().length > 0 && customLabel.trim() !== bookingsLabel;

  // Auto-clear "Saved" flashes
  useEffect(() => {
    if (!accountSaved) return;
    const t = window.setTimeout(() => setAccountSaved(false), 1800);
    return () => window.clearTimeout(t);
  }, [accountSaved]);
  useEffect(() => {
    if (!notifySaved) return;
    const t = window.setTimeout(() => setNotifySaved(false), 1800);
    return () => window.clearTimeout(t);
  }, [notifySaved]);
  useEffect(() => {
    if (!labelSaved) return;
    const t = window.setTimeout(() => setLabelSaved(false), 1800);
    return () => window.clearTimeout(t);
  }, [labelSaved]);

  const currentCategory = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0];

  return (
    <DashboardShell activeNav="settings" pageTitle="Settings">
      <div className="min-h-full bg-[#f8f9fb]">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <header className="mb-6 sm:mb-8">
            <h1 className="text-[22px] font-semibold tracking-tight text-[#202124] sm:text-[28px]">
              Settings
            </h1>
            <p className="mt-1 text-[13px] text-[#5f6368] sm:text-[14px]">
              Manage your workspace, AI information, channels, and alerts.
            </p>
          </header>

          <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-10">
            {/* Mobile / tablet category pills */}
            <nav aria-label="Settings categories" className="mb-5 lg:hidden">
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = cat.id === active;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActive(cat.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                        isActive
                          ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                          : "border-[#e5e7eb] bg-white text-[#3c4043] hover:bg-[#f6f8fc]",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* Desktop sidebar */}
            <aside className="hidden lg:block">
              <nav aria-label="Settings categories" className="sticky top-6">
                <ul className="space-y-1">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isActive = cat.id === active;
                    return (
                      <li key={cat.id}>
                        <button
                          type="button"
                          onClick={() => setActive(cat.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                            isActive
                              ? "bg-[#e8f0fe] font-medium text-[#1a73e8]"
                              : "text-[#3c4043] hover:bg-white",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4 flex-shrink-0",
                              isActive ? "text-[#1a73e8]" : "text-[#5f6368]",
                            )}
                          />
                          <span className="truncate">{cat.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </aside>

            {/* Right content panel */}
            <main className="min-w-0">
              <CategoryHeader
                title={currentCategory.label}
                description={currentCategory.description}
              />

              {active === "workspace" && (
                <Card
                  title="Business identity"
                  description="Used inside this dashboard. Public website and AI usage will be connected by the Unboks team."
                  footer={
                    <>
                      <SavedFlash visible={accountSaved} />
                      <PrimaryButton
                        type="button"
                        disabled={!accountDirty}
                        onClick={() => {
                          saveAccount(accountDraft);
                          setAccountSaved(true);
                        }}
                      >
                        Save changes
                      </PrimaryButton>
                    </>
                  }
                >
                  <div className="space-y-4">
                    {/* Logo first — Linear pattern */}
                    <div>
                      <FieldLabel>Logo</FieldLabel>
                      <div className="mt-2 flex items-start gap-4">
                        <div className="grid h-20 w-20 flex-shrink-0 place-items-center overflow-hidden rounded-xl border border-[#e8eaed] bg-[#f6f8fc]">
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
                            <GhostButton
                              type="button"
                              onClick={() => logoInputRef.current?.click()}
                            >
                              Upload logo
                            </GhostButton>
                            {accountDraft.logoDataUrl && (
                              <GhostButton
                                type="button"
                                onClick={() =>
                                  setAccountDraft((d) => ({ ...d, logoDataUrl: undefined }))
                                }
                                className="text-[#5f6368]"
                              >
                                Remove
                              </GhostButton>
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
                            PNG, JPG, WebP or SVG. Max 2 MB. Used in your dashboard.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {([
                        { key: "businessName", label: "Business name", type: "text", placeholder: "Acme Co." },
                        { key: "contactEmail", label: "Contact email", type: "email", placeholder: "hello@acme.com" },
                        { key: "phone", label: "Phone number", type: "tel", placeholder: "+1 555 123 4567" },
                        { key: "website", label: "Website", type: "url", placeholder: "https://acme.com" },
                      ] as const).map((field) => (
                        <label key={field.key} className="block">
                          <FieldLabel>{field.label}</FieldLabel>
                          <TextInput
                            type={field.type}
                            value={accountDraft[field.key] ?? ""}
                            placeholder={field.placeholder}
                            onChange={(e) =>
                              setAccountDraft((d) => ({ ...d, [field.key]: e.target.value }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {active === "your-info" && (
                <div className="space-y-5">
                  <Card
                    title="Add an update"
                    description="Temporary notes, offers, holidays, opening hours or seasonal info. Saved for setup — AI usage will be connected by the Unboks team."
                  >
                    <div className="space-y-4">
                      <div>
                        <FieldLabel>Type</FieldLabel>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {UPDATE_TYPES.map((t) => (
                            <button
                              key={t.value}
                              type="button"
                              onClick={() => setUpdateType(t.value)}
                              className={cn(
                                "rounded-full border px-3 py-1 text-[12px] transition-colors",
                                updateType === t.value
                                  ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                                  : "border-[#dadce0] bg-white text-[#5f6368] hover:bg-[#f6f8fc]",
                              )}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="block">
                        <FieldLabel>Note</FieldLabel>
                        <textarea
                          value={updateText}
                          onChange={(e) => setUpdateText(e.target.value)}
                          rows={3}
                          placeholder="Example: We are closed on Christmas Day, but open again on December 26."
                          className="mt-1 w-full min-w-0 resize-y rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-[13px] text-[#202124] outline-none placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                        />
                      </label>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                          <FieldLabel>Start date (optional)</FieldLabel>
                          <TextInput
                            type="date"
                            value={updateStart}
                            onChange={(e) => setUpdateStart(e.target.value)}
                          />
                        </label>
                        <label className="block">
                          <FieldLabel>End date (optional)</FieldLabel>
                          <TextInput
                            type="date"
                            value={updateEnd}
                            onChange={(e) => setUpdateEnd(e.target.value)}
                          />
                        </label>
                      </div>

                      <div>
                        <PrimaryButton
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
                        >
                          Add update
                        </PrimaryButton>
                      </div>
                    </div>
                  </Card>

                  <Card title="Active updates" description="Updates currently in your dashboard.">
                    {updates.length === 0 ? (
                      <p className="text-[13px] text-[#9aa0a6]">No updates yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {updates.map((u) => {
                          const typeLabel =
                            UPDATE_TYPES.find((t) => t.value === u.type)?.label ?? u.type;
                          return (
                            <li
                              key={u.id}
                              className={cn(
                                "rounded-xl border border-[#e8eaed] bg-white p-3",
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
                                  onClick={() => setUpdateActive(u.id, !u.active)}
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
                  </Card>

                  <YourInfoKnowledge blocks={sotBlocks} />
                </div>
              )}

              {active === "channels" && (
                <Card
                  title="Visible channels"
                  description="Hidden channels won't appear in the inbox sidebar or filters. This doesn't disconnect any account."
                >
                  <ul className="divide-y divide-[#f1f3f4]">
                    {TOGGLEABLE_CHANNELS.map((ch) => (
                      <li key={ch}>
                        <ToggleRow
                          label={ch}
                          checked={isChannelEnabled(ch)}
                          onChange={() => toggleChannel(ch)}
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {active === "escalation" && (
                <Card
                  title="Where alerts are sent"
                  description="Email is always on. Add backup channels you'd like to be reached on."
                  footer={
                    <>
                      <SavedFlash visible={notifySaved} />
                      <PrimaryButton
                        type="button"
                        disabled={!notifyDirty}
                        onClick={() => {
                          saveNotifyPrefs(notifyDraft);
                          setNotifySaved(true);
                        }}
                      >
                        Save changes
                      </PrimaryButton>
                    </>
                  }
                >
                  <div className="divide-y divide-[#f1f3f4]">
                    {/* Email row — mandatory */}
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[14px] text-[#202124]">Email</p>
                        <p className="mt-0.5 text-[12px] text-[#5f6368]">
                          Always on · uses your default account email
                        </p>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[11px] font-medium text-[#5f6368]">
                        Default
                      </span>
                    </div>

                    {([
                      { key: "whatsapp", label: "WhatsApp", placeholder: "+599 9 123 4567" },
                      { key: "messenger", label: "Messenger", placeholder: "username or profile link" },
                      { key: "telegram", label: "Telegram", placeholder: "@username or phone number" },
                    ] as { key: NotifyChannelKey; label: string; placeholder: string }[]).map(
                      (row) => {
                        const pref = notifyDraft[row.key];
                        return (
                          <div key={row.key} className="py-3">
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
                              <TextInput
                                type="text"
                                value={pref.destination}
                                onChange={(e) =>
                                  setNotifyDraft({
                                    ...notifyDraft,
                                    [row.key]: { ...pref, destination: e.target.value },
                                  })
                                }
                                placeholder={row.placeholder}
                              />
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>
                  <p className="mt-3 text-[12px] text-[#5f6368]">
                    Escalation delivery uses the channels connected by your Unboks setup.
                  </p>
                </Card>
              )}

              {active === "preferences" && (
                <div className="space-y-5">
                  <Card
                    title="Orders label"
                    description="What this section is called in the sidebar."
                    footer={
                      <>
                        <SavedFlash visible={labelSaved} />
                        <PrimaryButton
                          type="button"
                          disabled={!labelDirty}
                          onClick={() => {
                            if (customLabel.trim().length === 0) return;
                            setBookingsLabel(customLabel);
                            setLabelSaved(true);
                          }}
                        >
                          Save changes
                        </PrimaryButton>
                      </>
                    }
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {["Bookings", "Orders"].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setCustomLabel(opt)}
                            className={cn(
                              "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
                              customLabel.trim() === opt
                                ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                                : "border-[#dadce0] bg-white text-[#5f6368] hover:bg-[#f6f8fc]",
                            )}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                      <label className="block">
                        <FieldLabel>Custom label</FieldLabel>
                        <TextInput
                          type="text"
                          value={customLabel}
                          onChange={(e) => setCustomLabel(e.target.value)}
                          placeholder="Custom label…"
                        />
                      </label>
                    </div>
                  </Card>

                  <Card
                    title="Email replies"
                    description="Choose how email replies are opened from the inbox."
                  >
                    <div className="flex flex-wrap gap-2">
                      {(["gmail", "mailto"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setEmailClient(option)}
                          className={cn(
                            "rounded-lg border px-4 py-2 text-[13px] font-medium transition-colors",
                            emailClient === option
                              ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                              : "border-[#dadce0] bg-white text-[#5f6368] hover:bg-[#f6f8fc]",
                          )}
                        >
                          {option === "gmail" ? "Gmail" : "Default mail app"}
                        </button>
                      ))}
                    </div>
                  </Card>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

// ---------- Collapsible read-only knowledge from sot.ts ----------

function YourInfoKnowledge({ blocks }: { blocks: SotBlock[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left sm:px-6"
      >
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-[#202124]">Your AI knowledge</h3>
          <p className="mt-0.5 text-[13px] text-[#5f6368]">
            What your AI already knows about your business.
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-[#5f6368] transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-[#f1f3f4] px-5 py-5 sm:px-6">
          {blocks.length === 0 ? (
            <p className="text-[13px] text-[#9aa0a6]">No knowledge added yet.</p>
          ) : (
            blocks.map((block) => <SotKnowledgeCard key={block.id} block={block} />)
          )}
        </div>
      )}
    </section>
  );
}
