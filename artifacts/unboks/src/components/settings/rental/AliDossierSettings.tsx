import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  FileKey2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import {
  fetchAliDossierSettings,
  fetchAliReservationV2Settings,
  updateAliDossierActivation,
  updateAliDossierSettings,
  updateAliReservationV2Settings,
  uploadAliContractTemplate,
  type AliDossierTenantSettings,
  type AliReservationV2Settings,
} from "@/lib/api";
import { ApiError } from "@/lib/error";
import { tenantKey } from "@/lib/query-keys";

const SETTINGS_KEY = "ali-dossier-settings";
const V2_SETTINGS_KEY = "ali-reservation-v2-settings";
const TEMPLATE_TYPES = [".txt", ".md", ".pdf", ".docx"];
const MAX_TEMPLATE_BYTES = 2 * 1024 * 1024;

function useAliDossierSettings() {
  return useQuery({
    queryKey: tenantKey(SETTINGS_KEY),
    queryFn: fetchAliDossierSettings,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) {
    return error.message.replaceAll("_", " ");
  }
  return "The rental settings could not be saved.";
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white">
      <header className="border-b border-[#f1f3f4] px-5 py-4 sm:px-6">
        <h3 className="text-[14px] font-semibold text-[#202124]">{title}</h3>
        <p className="mt-0.5 text-[13px] text-[#5f6368]">{description}</p>
      </header>
      <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </section>
  );
}

function LoadingCard() {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-2xl border border-[#e8eaed] bg-white">
      <Loader2
        className="h-5 w-5 animate-spin text-[#1a73e8]"
        aria-label="Loading rental settings"
      />
    </div>
  );
}

export function AliDossierSettings() {
  const queryClient = useQueryClient();
  const query = useAliDossierSettings();
  const v2Query = useQuery({
    queryKey: tenantKey(V2_SETTINGS_KEY),
    queryFn: fetchAliReservationV2Settings,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState("");
  const [template, setTemplate] = useState<File | null>(null);
  const [paymentMode, setPaymentMode] = useState<
    "fixed_link" | "per_reservation"
  >("per_reservation");
  const [providerName, setProviderName] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [domains, setDomains] = useState("");
  const [holdHours, setHoldHours] = useState(24);
  const [reminderHours, setReminderHours] = useState("3, 12, 21");
  const [quietStart, setQuietStart] = useState("20:30");
  const [quietEnd, setQuietEnd] = useState("08:30");
  const [defaultTimezone, setDefaultTimezone] = useState("America/Curacao");

  useEffect(() => {
    if (!query.data) return;
    setPaymentMode(query.data.payment.mode);
    setProviderName(query.data.payment.providerName);
    setPaymentUrl("");
    setDomains(query.data.payment.allowedDomains.join("\n"));
  }, [query.data]);

  useEffect(() => {
    if (!v2Query.data) return;
    setHoldHours(v2Query.data.holdActiveClientHours);
    setReminderHours(v2Query.data.reminderActiveClientHours.join(", "));
    setQuietStart(v2Query.data.quietHoursStart);
    setQuietEnd(v2Query.data.quietHoursEnd);
    setDefaultTimezone(v2Query.data.defaultTimezone);
  }, [v2Query.data]);

  const refresh = async (next: AliDossierTenantSettings) => {
    queryClient.setQueryData(tenantKey(SETTINGS_KEY), next);
    await queryClient.invalidateQueries({
      queryKey: tenantKey("ali-dossier-configuration"),
    });
  };

  const upload = useMutation({
    mutationFn: () => {
      if (!template || !version.trim()) {
        throw new Error("Choose a template and enter its version name.");
      }
      return uploadAliContractTemplate(version.trim(), template);
    },
    onSuccess: async (next) => {
      setVersion("");
      setTemplate(null);
      if (fileInput.current) fileInput.current.value = "";
      await refresh(next);
      toast.success("Pre-contract template uploaded and activated.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const savePayment = useMutation({
    mutationFn: () => {
      if (!query.data) throw new Error("Rental settings are not loaded.");
      return updateAliDossierSettings({
        paymentMode,
        paymentProviderName: providerName.trim(),
        ...(paymentUrl.trim() ? { paymentUrl: paymentUrl.trim() } : {}),
        clearPaymentUrl: paymentMode === "per_reservation",
        paymentAllowedDomains: domains
          .split(/[\n,]/)
          .map((value) => value.trim())
          .filter(Boolean),
        documentRetentionDays: query.data.retention.documentRetentionDays,
        paperShreddingPolicy: query.data.retention.paperShreddingPolicy,
      });
    },
    onSuccess: async (next) => {
      setPaymentUrl("");
      await refresh(next);
      toast.success("Tenant payment settings saved.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const activation = useMutation({
    mutationFn: (enabled: boolean) => updateAliDossierActivation(enabled),
    onSuccess: async (next) => {
      await refresh(next);
      toast.success(
        next.status.enabled
          ? "Secure customer file activated."
          : "Secure customer file deactivated.",
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const saveTiming = useMutation({
    mutationFn: () => {
      const reminders = reminderHours
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value));
      if (
        !Number.isFinite(holdHours) ||
        holdHours < 1 ||
        reminders.length < 1 ||
        reminders.length > 3 ||
        reminders.some((value) => value <= 0 || value >= holdHours)
      ) {
        throw new Error(
          "Use 1–3 reminder hours, each before the hold expires.",
        );
      }
      return updateAliReservationV2Settings({
        holdActiveClientHours: holdHours,
        reminderActiveClientHours: reminders,
        quietHoursStart: quietStart,
        quietHoursEnd: quietEnd,
        defaultTimezone: defaultTimezone.trim(),
      });
    },
    onSuccess: (next: AliReservationV2Settings) => {
      queryClient.setQueryData(tenantKey(V2_SETTINGS_KEY), next);
      toast.success("Reservation timing settings saved.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (query.isLoading) return <LoadingCard />;
  if (!query.data) {
    return (
      <SettingsCard
        title="Rental customer file"
        description="Tenant-owned pre-contract and payment settings."
      >
        <p className="text-sm text-rose-700">
          These settings are unavailable. Refresh the page or contact your
          Unboks team.
        </p>
      </SettingsCard>
    );
  }

  const current = query.data;
  const missingRequirements = current.status.blockers.filter(
    (blocker) => blocker !== "feature_disabled",
  );
  const activationOn = current.status.enabled;
  const canToggleActivation = activationOn || current.status.configurationReady;
  const fixedLinkMissing =
    paymentMode === "fixed_link" &&
    !current.payment.defaultLinkConfigured &&
    !paymentUrl.startsWith("https://");

  return (
    <div className="space-y-5">
      <div
        className={`rounded-2xl border px-5 py-4 text-sm ${
          current.status.ready
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : current.status.configurationReady
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "border-slate-200 bg-slate-50 text-slate-900"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {current.status.ready
                ? "Secure customer file is active"
                : activationOn
                  ? "Secure customer file is paused by incomplete setup"
                  : current.status.configurationReady
                    ? "Everything is ready — activate when you are ready"
                    : "Complete the tenant setup before activation"}
            </p>
            <p className="mt-1 text-xs leading-relaxed opacity-80">
              {current.status.ready
                ? "Nick and staff can continue accepted quotes through documents, pre-contract, payment and office approval."
                : current.status.configurationReady
                  ? "Turn this on to start the post-quote customer-file workflow. You can turn it off again at any time."
                  : missingRequirements
                      .map((blocker) => blocker.replaceAll("_", " "))
                      .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs font-semibold">
              {activationOn ? "On" : "Off"}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={activationOn}
              aria-label={
                activationOn
                  ? "Deactivate secure customer file"
                  : "Activate secure customer file"
              }
              disabled={activation.isPending || !canToggleActivation}
              onClick={() => activation.mutate(!activationOn)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${
                activationOn ? "bg-emerald-600" : "bg-slate-400"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  activationOn ? "translate-x-6" : "translate-x-1"
                }`}
              />
              {activation.isPending && (
                <Loader2 className="absolute left-3.5 h-5 w-5 animate-spin text-white" />
              )}
            </button>
          </div>
        </div>
      </div>
      <SettingsCard
        title="Reservation hold and reminders"
        description="Active-client time runs only while the customer is responsible for the next step."
      >
        {v2Query.isError ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Reservation timing settings are unavailable.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-sm font-medium text-[#202124]">
                Hold duration (active hours)
                <input
                  type="number"
                  min={1}
                  max={720}
                  step={1}
                  value={holdHours}
                  onChange={(event) => setHoldHours(Number(event.target.value))}
                  className="mt-1 h-11 w-full rounded-xl border border-[#dadce0] px-3 font-normal outline-none focus:border-[#1a73e8]"
                />
              </label>
              <label className="block text-sm font-medium text-[#202124]">
                Reminder hours
                <input
                  value={reminderHours}
                  onChange={(event) => setReminderHours(event.target.value)}
                  placeholder="3, 12, 21"
                  className="mt-1 h-11 w-full rounded-xl border border-[#dadce0] px-3 font-normal outline-none focus:border-[#1a73e8]"
                />
              </label>
              <label className="block text-sm font-medium text-[#202124]">
                Client timezone fallback
                <input
                  value={defaultTimezone}
                  onChange={(event) => setDefaultTimezone(event.target.value)}
                  placeholder="America/Curacao"
                  className="mt-1 h-11 w-full rounded-xl border border-[#dadce0] px-3 font-normal outline-none focus:border-[#1a73e8]"
                />
              </label>
              <label className="block text-sm font-medium text-[#202124]">
                Quiet hours start
                <input
                  type="time"
                  value={quietStart}
                  onChange={(event) => setQuietStart(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-[#dadce0] px-3 font-normal outline-none focus:border-[#1a73e8]"
                />
              </label>
              <label className="block text-sm font-medium text-[#202124]">
                Quiet hours end
                <input
                  type="time"
                  value={quietEnd}
                  onChange={(event) => setQuietEnd(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-[#dadce0] px-3 font-normal outline-none focus:border-[#1a73e8]"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f8f9fa] px-4 py-3">
              <p className="flex items-center gap-2 text-xs leading-relaxed text-[#5f6368]">
                <Clock3 className="h-4 w-4 text-[#1a73e8]" />
                Reminder delivery safety gate:{" "}
                <strong>
                  {v2Query.data?.reminderSendEnabled ? "enabled" : "disabled"}
                </strong>
                . Schedule changes do not bypass this deployment gate.
              </p>
              <button
                type="button"
                disabled={saveTiming.isPending || v2Query.isLoading}
                onClick={() => saveTiming.mutate()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1a73e8] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#c8d4e6]"
              >
                {saveTiming.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Save timing
              </button>
            </div>
          </>
        )}
      </SettingsCard>
      <SettingsCard
        title="Pre-contract template"
        description="Upload the approved template for this tenant. Every version is immutable and auditable."
      >
        {current.contractTemplate ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">
                Active version {current.contractTemplate.version}
              </p>
              <p className="text-xs text-emerald-800">
                {current.contractTemplate.sourceFilename}
                {current.contractTemplate.uploadedAt
                  ? ` · uploaded ${new Date(current.contractTemplate.uploadedAt).toLocaleString()}`
                  : ""}
              </p>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No approved pre-contract template is active yet.
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-[13rem_minmax(0,1fr)_auto] md:items-end">
          <label className="block text-sm font-medium text-[#202124]">
            Version name
            <input
              value={version}
              maxLength={80}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="Ali rental terms v1"
              className="mt-1 h-11 w-full rounded-xl border border-[#dadce0] px-3 font-normal outline-none focus:border-[#1a73e8]"
            />
          </label>
          <label className="block text-sm font-medium text-[#202124]">
            Approved template
            <input
              ref={fileInput}
              type="file"
              accept={TEMPLATE_TYPES.join(",")}
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                if (selected && selected.size > MAX_TEMPLATE_BYTES) {
                  event.target.value = "";
                  setTemplate(null);
                  toast.error("Template must be 2 MB or smaller.");
                  return;
                }
                setTemplate(selected);
              }}
              className="mt-1 block min-h-11 w-full rounded-xl border border-[#dadce0] bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#eef3fb] file:px-3 file:py-1.5 file:font-medium"
            />
          </label>
          <button
            type="button"
            disabled={upload.isPending || !template || !version.trim()}
            onClick={() => upload.mutate()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1a73e8] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#c8d4e6]"
          >
            {upload.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileKey2 className="h-4 w-4" />
            )}
            Upload version
          </button>
        </div>
        <p className="text-xs leading-relaxed text-[#5f6368]">
          TXT, Markdown, PDF, or DOCX. Supported placeholders include
          customer_name, rental dates, locations, vehicle, totals, quote
          reference, and reservation reference. Uploading a new version never
          rewrites an already signed contract.
        </p>
      </SettingsCard>

      <SettingsCard
        title="Deposit payment method"
        description="Choose one tenant link or require a fresh approved link for every reservation."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              [
                "per_reservation",
                "Per-reservation link",
                "Staff creates or pastes a unique payment link in the customer file.",
              ],
              [
                "fixed_link",
                "One tenant payment link",
                "Nick uses the tenant’s approved payment page for each rental.",
              ],
            ] as const
          ).map(([value, label, detail]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-xl border p-4 ${paymentMode === value ? "border-[#1a73e8] bg-[#f3f7ff]" : "border-[#dadce0]"}`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-[#202124]">
                <input
                  type="radio"
                  name="payment-mode"
                  value={value}
                  checked={paymentMode === value}
                  onChange={() => setPaymentMode(value)}
                />
                {label}
              </span>
              <span className="mt-1 block pl-6 text-xs leading-relaxed text-[#5f6368]">
                {detail}
              </span>
            </label>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm font-medium text-[#202124]">
            Provider or payment method name
            <input
              value={providerName}
              maxLength={80}
              onChange={(event) => setProviderName(event.target.value)}
              placeholder="Payment provider"
              className="mt-1 h-11 w-full rounded-xl border border-[#dadce0] px-3 font-normal outline-none focus:border-[#1a73e8]"
            />
          </label>
          <label className="block text-sm font-medium text-[#202124]">
            Approved HTTPS domains
            <textarea
              value={domains}
              rows={2}
              onChange={(event) => setDomains(event.target.value)}
              placeholder="payments.example.com"
              className="mt-1 w-full rounded-xl border border-[#dadce0] px-3 py-2 font-normal outline-none focus:border-[#1a73e8]"
            />
          </label>
        </div>

        {paymentMode === "fixed_link" && (
          <label className="block text-sm font-medium text-[#202124]">
            Tenant payment link
            <input
              type="url"
              value={paymentUrl}
              autoComplete="off"
              onChange={(event) => setPaymentUrl(event.target.value)}
              placeholder={
                current.payment.defaultLinkConfigured
                  ? `Configured for ${current.payment.defaultDomain ?? "approved provider"} — enter only to replace`
                  : "https://payments.example.com/..."
              }
              className="mt-1 h-11 w-full rounded-xl border border-[#dadce0] px-3 font-normal outline-none focus:border-[#1a73e8]"
            />
            <span className="mt-1 block text-xs font-normal text-[#5f6368]">
              The stored URL is never returned to the browser after saving.
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[#5f6368]">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Nick sends only a server-validated HTTPS link. Customer messages can
            never set it.
          </div>
          <button
            type="button"
            disabled={savePayment.isPending || fixedLinkMissing}
            onClick={() => savePayment.mutate()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1a73e8] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#c8d4e6]"
          >
            {savePayment.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Save payment settings
          </button>
        </div>
      </SettingsCard>
    </div>
  );
}

export function AliDossierRetentionSettings() {
  const queryClient = useQueryClient();
  const query = useAliDossierSettings();
  const [days, setDays] = useState(90);
  const [policy, setPolicy] = useState(
    "Securely shred paper copies after the 90-day retention period.",
  );

  useEffect(() => {
    if (!query.data) return;
    setDays(query.data.retention.documentRetentionDays);
    setPolicy(query.data.retention.paperShreddingPolicy);
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!query.data) throw new Error("Rental settings are not loaded.");
      return updateAliDossierSettings({
        paymentMode: query.data.payment.mode,
        paymentProviderName: query.data.payment.providerName,
        clearPaymentUrl: false,
        paymentAllowedDomains: query.data.payment.allowedDomains,
        documentRetentionDays: days,
        paperShreddingPolicy: policy.trim(),
      });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(tenantKey(SETTINGS_KEY), next);
      toast.success("Rental document-retention policy saved.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const dirty = useMemo(
    () =>
      Boolean(query.data) &&
      (days !== query.data?.retention.documentRetentionDays ||
        policy.trim() !== query.data?.retention.paperShreddingPolicy),
    [days, policy, query.data],
  );

  if (query.isLoading) return <LoadingCard />;
  if (!query.data) return null;

  return (
    <SettingsCard
      title="Rental identity-document retention"
      description="Tenant-specific policy for private licence and ID copies collected during a rental."
    >
      <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
        <label className="block text-sm font-medium text-[#202124]">
          Keep private copies for
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={3650}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="h-11 w-28 rounded-xl border border-[#dadce0] px-3 font-normal outline-none focus:border-[#1a73e8]"
            />
            <span className="text-sm font-normal text-[#5f6368]">days</span>
          </div>
        </label>
        <label className="block text-sm font-medium text-[#202124]">
          Paper-copy shredding policy
          <textarea
            rows={3}
            maxLength={500}
            value={policy}
            onChange={(event) => setPolicy(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[#dadce0] px-3 py-2 font-normal outline-none focus:border-[#1a73e8]"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f8f9fa] px-4 py-3">
        <p className="text-xs leading-relaxed text-[#5f6368]">
          Default: 90 days. Deletion removes private document bytes while
          preserving only a minimal audit event.
        </p>
        <button
          type="button"
          disabled={
            mutation.isPending ||
            !dirty ||
            !Number.isInteger(days) ||
            days < 1 ||
            days > 3650 ||
            policy.trim().length < 10
          }
          onClick={() => mutation.mutate()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1a73e8] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#c8d4e6]"
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save rental retention
        </button>
      </div>
    </SettingsCard>
  );
}
