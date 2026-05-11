import { useEffect, useMemo, useRef, useState, ChangeEvent } from "react";
import {
  Archive,
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
import {
  useEscalationNotificationPrefs,
  type NotifyChannelKey,
  type DeliveryStatus,
} from "@/hooks/use-escalation-notification-preferences";
import { ApiError } from "@/lib/error";
import { useEnabledChannels, TOGGLEABLE_CHANNELS } from "@/hooks/use-enabled-channels";
import { useAccountSettings, type AccountSettings } from "@/hooks/use-account-settings";
import { useYourInfoUpdates, UPDATE_TYPES, type YourInfoUpdateType } from "@/hooks/use-your-info-updates";
import { KnowledgeFileUploader } from "@/components/settings/KnowledgeFileUploader";
import { CloudKnowledgeConnections } from "@/components/settings/CloudKnowledgeConnections";
import { DataRetentionSettings } from "@/components/settings/DataRetentionSettings";
import { DisconnectUnboksDanger } from "@/components/settings/DisconnectUnboksDanger";
import { loadSot, type SotBlock } from "@/data/sot";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
// Lightweight email shape check for the optional alternative email field.
// Matches the same shape used elsewhere (EmailForwardModal) so behaviour
// is consistent across the app.
const ALT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CategoryId =
  | "workspace"
  | "your-info"
  | "channels"
  | "escalation"
  | "data-retention"
  | "preferences";

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
    label: "Company knowledge",
    description:
      "Add business information, files, policies, offers, and cloud folders your Agent can use when answering customers.",
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
    label: "Alerts",
    description: "Choose where notifications should be sent.",
    icon: Bell,
  },
  {
    id: "data-retention",
    label: "Data retention & archive",
    description: "Control how long conversations stay active, archived, and searchable.",
    icon: Archive,
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
        <footer className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-[#f1f3f4] bg-[#fafbfc] px-5 py-3 sm:px-6">
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

/**
 * Small status pill rendered next to each escalation alert channel so the
 * operator knows whether a saved destination is actually being delivered.
 */
function DeliveryBadge({ status }: { status: DeliveryStatus }) {
  const map: Record<DeliveryStatus, { label: string; className: string }> = {
    active: {
      label: "Active",
      className: "bg-[#e6f4ea] text-[#137333]",
    },
    pending_activation: {
      label: "Pending activation",
      className: "bg-[#fef7e0] text-[#7a5a00]",
    },
    not_configured: {
      label: "Not configured",
      className: "bg-[#f1f3f4] text-[#5f6368]",
    },
    saved_only: {
      label: "Not yet sending",
      className: "bg-[#f1f3f4] text-[#5f6368]",
    },
    provider_not_configured: {
      label: "Not yet connected",
      className: "bg-[#fef7e0] text-[#7a5a00]",
    },
    failed: {
      label: "Failed",
      className: "bg-[#fce8e6] text-[#a50e0e]",
    },
    default: {
      label: "Default",
      className: "bg-[#f1f3f4] text-[#5f6368]",
    },
    disabled: {
      label: "Disabled",
      className: "bg-[#f1f3f4] text-[#9aa0a6]",
    },
  };
  const { label, className } = map[status];
  return (
    <span
      className={cn(
        "flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      {label}
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
  const {
    prefs: notifyPrefs,
    save: saveNotifyPrefs,
    isLoading: notifyLoading,
    isSaving: notifySaving,
    source: notifySource,
    loadError: notifyLoadError,
    deliveryStatuses: notifyDeliveryStatuses,
    defaultEmailAddress: notifyDefaultEmail,
  } = useEscalationNotificationPrefs();
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
  // Re-sync the draft whenever the backend-loaded prefs change (initial
  // GET, after a successful PUT, or after a refetch). Without this the
  // form would keep showing whatever was in localStorage even after the
  // backend's true settings arrived.
  useEffect(() => {
    setNotifyDraft(notifyPrefs);
  }, [notifyPrefs]);
  const notifyDirty = useMemo(
    () => JSON.stringify(notifyPrefs) !== JSON.stringify(notifyDraft),
    [notifyPrefs, notifyDraft],
  );

  // Validate the draft: any enabled channel must have a non-empty
  // destination, otherwise the backend would reject the save anyway.
  // The alternative email is optional; when filled it must look like an
  // email address, but it never blocks WhatsApp/Telegram/Messenger saves
  // when left empty.
  const notifyValidationError = useMemo(() => {
    const labels: Record<NotifyChannelKey, string> = {
      whatsapp: "WhatsApp",
      messenger: "Messenger",
      telegram: "Telegram",
    };
    for (const key of Object.keys(labels) as NotifyChannelKey[]) {
      const p = notifyDraft[key];
      if (p.enabled && p.destination.trim().length === 0) {
        return `Add a ${labels[key]} destination, or turn ${labels[key]} off.`;
      }
    }
    const alt = notifyDraft.alternativeEmail.trim();
    if (alt.length > 0 && !ALT_EMAIL_RE.test(alt)) {
      return "Enter a valid email address.";
    }
    return null;
  }, [notifyDraft]);

  const handleSaveNotifyPrefs = async () => {
    if (notifyValidationError) {
      toast.error(notifyValidationError);
      return;
    }
    try {
      await saveNotifyPrefs(notifyDraft);
      setNotifySaved(true);
    } catch (err) {
      // Surface the backend message verbatim, never pretend it saved.
      // Fallback copy is only used when the error has no usable message.
      let msg = "Couldn't save escalation alerts. Please try again.";
      if (err instanceof ApiError) {
        if (err.message && err.message.trim().length > 0) {
          msg = err.message;
        } else {
          msg = `Save failed (${err.status}).`;
        }
      } else if (err instanceof Error && err.message) {
        msg = err.message;
      }
      toast.error(msg);
    }
  };

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
    <DashboardShell
      activeNav="settings"
      pageTitle="Settings"
      pageSubtitle="Manage your workspace, Agent information, channels, and alerts."
      hideRefresh
    >
      <div className="min-h-full bg-[#f8f9fb]">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">

          {/* Top tab bar — horizontally scrollable on mobile, full-width on desktop */}
          <nav
            aria-label="Settings categories"
            className="mb-6 border-b border-[#e8eaed]"
          >
            <div
              role="tablist"
              className="-mb-px flex gap-1 overflow-x-auto sm:gap-2"
              style={{ scrollbarWidth: "none" }}
            >
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isActive = cat.id === active;
                return (
                  <button
                    key={cat.id}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    onClick={() => setActive(cat.id)}
                    className={cn(
                      "inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors sm:px-4",
                      isActive
                        ? "border-[#1a73e8] text-[#1a73e8] font-medium"
                        : "border-transparent text-[#5f6368] hover:text-[#202124] hover:border-[#dadce0]",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5",
                        isActive ? "text-[#1a73e8]" : "text-[#9aa0a6]",
                      )}
                    />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </nav>

          <div>
            <main className="min-w-0">
              <CategoryHeader
                title={currentCategory.label}
                description={currentCategory.description}
              />

              {active === "workspace" && (
                <div className="space-y-5">
                <Card
                  title="Business identity"
                  description="Used inside this dashboard. Public website and Agent usage will be connected by the Unboks team."
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

                {/* Danger zone — visually separated from everyday workspace
                    settings. Multi-step typed-confirmation modal lives
                    inside this component; backend-honest about whether
                    the disconnect was actually executed or just recorded
                    locally. See `DisconnectUnboksDanger` + `disconnectUnboks`. */}
                <DisconnectUnboksDanger />
                </div>
              )}

              {active === "your-info" && (
                <div className="space-y-5">
                  <Card
                    title="Add knowledge"
                    description="Quickly add business information your Unboks Agent can use when replying to customers. Examples: holiday hours, offers, pricing rules, policies."
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
                          Save knowledge
                        </PrimaryButton>
                      </div>
                    </div>
                  </Card>

                  <Card
                    title="Saved knowledge updates"
                    description="Notes you've added. Your Agent can use this information when replying to customers."
                  >
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

                  <Card
                    title="Upload knowledge files"
                    description="Documents, menus, price lists, FAQs, screenshots, and policies your Agent can use when replying."
                  >
                    <KnowledgeFileUploader />
                  </Card>

                  <Card
                    title="Connect cloud storage"
                    description="Link folders from Google Drive, OneDrive, Dropbox, SharePoint, or Box so your Agent can use the documents inside."
                  >
                    <CloudKnowledgeConnections />
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
                  title="Alerts"
                  description="Choose which alerts you want to receive and where they should be sent."
                  footer={
                    <>
                      <SavedFlash visible={notifySaved} />
                      <PrimaryButton
                        type="button"
                        disabled={!notifyDirty || notifySaving || notifyLoading}
                        onClick={handleSaveNotifyPrefs}
                      >
                        {notifySaving ? "Saving…" : "Save changes"}
                      </PrimaryButton>
                    </>
                  }
                >
                  {notifySource === "local" && notifyLoadError && (
                    <div className="mb-3 rounded-lg border border-[#fde293] bg-[#fef7e0] px-3 py-2 text-[12px] text-[#5f6368]">
                      {notifyLoadError}
                    </div>
                  )}
                  {notifyValidationError && (
                    <div className="mb-3 rounded-lg border border-[#f4c7c3] bg-[#fce8e6] px-3 py-2 text-[12px] text-[#a50e0e]">
                      {notifyValidationError}
                    </div>
                  )}

                  {/* Alert types — which kinds of notifications the
                      operator wants. Persisted via the same
                      /settings/escalation-alerts endpoint as channel
                      destinations: edits go into `notifyDraft` and are
                      saved by the existing Save button below alongside
                      every other field, so destinations are always
                      preserved on save. */}
                  <div className="mb-4">
                    <p className="text-[12px] font-medium uppercase tracking-wide text-[#5f6368]">
                      Alert types
                    </p>
                    <div className="mt-2 divide-y divide-[#f1f3f4] rounded-lg border border-[#e8eaed]">
                      <div className="flex items-start justify-between gap-4 px-3 py-3">
                        <div className="min-w-0">
                          <p className="text-[14px] text-[#202124]">Escalation alerts</p>
                          <p className="mt-0.5 text-[12px] text-[#5f6368]">
                            Get notified when Marina needs human help or a customer conversation requires attention.
                          </p>
                        </div>
                        <Switch
                          checked={notifyDraft.alertTypes.escalations}
                          onCheckedChange={(v) =>
                            setNotifyDraft((d) => ({
                              ...d,
                              alertTypes: { ...d.alertTypes, escalations: v },
                            }))
                          }
                          disabled={notifyLoading || notifySaving}
                          aria-label="Receive escalation alerts"
                          className="mt-0.5 data-[state=checked]:bg-[#1a73e8] data-[state=unchecked]:bg-[#dadce0]"
                        />
                      </div>
                      <div className="flex items-start justify-between gap-4 px-3 py-3">
                        <div className="min-w-0">
                          <p className="text-[14px] text-[#202124]">Appointment alerts</p>
                          <p className="mt-0.5 text-[12px] text-[#5f6368]">
                            Get notified when a customer confirms an appointment, booking, order, or scheduled call.
                          </p>
                        </div>
                        <Switch
                          checked={notifyDraft.alertTypes.appointments}
                          onCheckedChange={(v) =>
                            setNotifyDraft((d) => ({
                              ...d,
                              alertTypes: { ...d.alertTypes, appointments: v },
                            }))
                          }
                          disabled={notifyLoading || notifySaving}
                          aria-label="Receive appointment alerts"
                          className="mt-0.5 data-[state=checked]:bg-[#1a73e8] data-[state=unchecked]:bg-[#dadce0]"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-[#5f6368]">
                      Where alerts are sent
                    </p>
                  </div>

                  <div className="divide-y divide-[#f1f3f4]">
                    {/* Email row — mandatory */}
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[14px] text-[#202124]">Email</p>
                        <p
                          className="mt-0.5 truncate text-[12px] text-[#5f6368]"
                          title={notifyDefaultEmail ?? undefined}
                        >
                          {notifyDefaultEmail
                            ? `Always on, sent to ${notifyDefaultEmail}`
                            : "Always on, uses your default account email"}
                        </p>
                        {notifyPrefs.alternativeEmail.trim().length > 0 && (
                          <p
                            className="mt-0.5 truncate text-[12px] text-[#5f6368]"
                            title={notifyPrefs.alternativeEmail.trim()}
                          >
                            Alternative: {notifyPrefs.alternativeEmail.trim()}
                          </p>
                        )}
                      </div>
                      <DeliveryBadge status={notifyDeliveryStatuses.email ?? "default"} />
                    </div>

                    {/* Alternative email input — optional secondary recipient */}
                    <div className="py-3">
                      <label
                        htmlFor="escalation-alt-email"
                        className="block text-[12px] font-medium text-[#5f6368]"
                      >
                        Alternative email
                      </label>
                      <input
                        id="escalation-alt-email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        value={notifyDraft.alternativeEmail}
                        onChange={(e) =>
                          setNotifyDraft((d) => ({ ...d, alternativeEmail: e.target.value }))
                        }
                        placeholder="second@example.com"
                        disabled={notifyLoading || notifySaving}
                        className="mt-1 h-9 w-full rounded-md border border-[#dadce0] bg-white px-3 text-[14px] text-[#202124] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] disabled:bg-[#f8f9fa] disabled:text-[#9aa0a6]"
                      />
                      <p className="mt-1 text-[11px] text-[#5f6368]">
                        Send alerts to an additional email address. Leave empty to use only the default.
                      </p>
                    </div>

                    {([
                      { key: "whatsapp", label: "WhatsApp", placeholder: "+599 9 123 4567" },
                      { key: "messenger", label: "Messenger", placeholder: "username or profile link" },
                      { key: "telegram", label: "Telegram", placeholder: "@username or phone number" },
                    ] as { key: NotifyChannelKey; label: string; placeholder: string }[]).map(
                      (row) => {
                        const pref = notifyDraft[row.key];
                        const status = notifyDeliveryStatuses[row.key];
                        // WhatsApp shows its status badge in every state
                        // (Active / Pending activation / Not configured /
                        // Disabled) so the operator always knows where the
                        // channel stands. Telegram and Messenger only show
                        // a badge when enabled, since their disabled state
                        // is conveyed by the toggle alone.
                        const showBadge =
                          status !== undefined &&
                          (row.key === "whatsapp" || pref.enabled);
                        return (
                          <div key={row.key} className="py-3">
                            <div className="flex items-center justify-between gap-4 py-3">
                              <div className="min-w-0">
                                <p className="text-[14px] text-[#202124]">{row.label}</p>
                              </div>
                              <div className="flex flex-shrink-0 items-center gap-2">
                                {showBadge && <DeliveryBadge status={status!} />}
                                <Switch
                                  checked={pref.enabled}
                                  onCheckedChange={(v) =>
                                    setNotifyDraft({
                                      ...notifyDraft,
                                      [row.key]: { ...pref, enabled: v },
                                    })
                                  }
                                  className="data-[state=checked]:bg-[#1a73e8] data-[state=unchecked]:bg-[#dadce0]"
                                />
                              </div>
                            </div>
                            {pref.enabled && (
                              <>
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
                                {row.key === "whatsapp" && (
                                  <p className="mt-1 text-[11px] text-[#5f6368]">
                                    Include country code, for example +599 for Curaçao or +351 for Portugal.
                                  </p>
                                )}
                              </>
                            )}
                            {/* WhatsApp activation guidance. Only shown
                                when the operator has enabled WhatsApp
                                alerts, so we never lecture them about a
                                channel they didn't ask for. The longer
                                START-message instruction appears for
                                "pending activation"; the short
                                confirmation for "active". The business
                                number isn't hardcoded — it's part of the
                                Unboks setup the operator already knows. */}
                            {row.key === "whatsapp" && pref.enabled && status === "pending_activation" && (
                              <div className="mt-2 rounded-md border border-[#fde293] bg-[#fef7e0] px-3 py-2 text-[12px] text-[#7a5a00]">
                                WhatsApp alerts are configured but not active yet. Send START from this operator WhatsApp number to the business WhatsApp number to activate alerts.
                              </div>
                            )}
                            {row.key === "whatsapp" && pref.enabled && status === "active" && (
                              <p className="mt-2 text-[12px] text-[#137333]">
                                WhatsApp alerts are active.
                              </p>
                            )}
                            {row.key === "whatsapp" && pref.enabled && status === "not_configured" && (
                              <p className="mt-2 text-[12px] text-[#5f6368]">
                                Add a WhatsApp number above to activate alerts.
                              </p>
                            )}
                            {row.key === "whatsapp" && pref.enabled && status === "saved_only" && (
                              <p className="mt-2 text-[12px] text-[#5f6368]">
                                Settings are saved but alerts are not sending yet. Contact your Unboks team if this does not update soon.
                              </p>
                            )}
                            {row.key === "whatsapp" && pref.enabled && status === "provider_not_configured" && (
                              <p className="mt-2 text-[12px] text-[#5f6368]">
                                Your Unboks team still needs to finish setup. No action needed on your end.
                              </p>
                            )}
                            {row.key === "whatsapp" && pref.enabled && status === "failed" && (
                              <p className="mt-2 text-[12px] text-[#a50e0e]">
                                Recent delivery failed. Check the number or contact your Unboks team.
                              </p>
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>
                  <div className="mt-4 space-y-1 rounded-lg border border-[#e6e8eb] bg-[#fbfbfd] px-3 py-3 text-[11px] text-[#5f6368]">
                    <p className="font-medium text-[#3c4043]">Status guide</p>
                    <p><span className="font-medium text-[#137333]">Active</span> — alerts are being sent.</p>
                    <p><span className="font-medium text-[#7a5a00]">Pending activation</span> — configured and saved. Send START from your WhatsApp to the business number to finish activating.</p>
                    <p><span className="font-medium text-[#5f6368]">Not yet sending</span> — settings are saved but no delivery yet. Contact your Unboks team if this persists.</p>
                    <p><span className="font-medium text-[#7a5a00]">Not yet connected</span> — your Unboks team still needs to finish setup. No action needed on your end.</p>
                    <p><span className="font-medium text-[#a50e0e]">Failed</span> — recent delivery failed. Check the number or contact your Unboks team.</p>
                  </div>
                </Card>
              )}

              {active === "data-retention" && (
                <div className="space-y-5">
                  <DataRetentionSettings />
                </div>
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
          <h3 className="text-[14px] font-semibold text-[#202124]">
            What your Agent already knows
          </h3>
          <p className="mt-0.5 text-[13px] text-[#5f6368]">
            A snapshot of the business details your Agent is already using.
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
