import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Archive, BadgeDollarSign, BellRing, CalendarClock, Car, Check, CheckCircle2,
  Clock3, Copy, FileCheck2, MapPin, MessageCircle, Phone, RefreshCw,
  ShieldCheck, UserRound, UsersRound, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { AliCustomerFile } from "@/components/ali/AliCustomerFile";
import {
  archiveConversation, confirmAliReservation, decideAliReservationAvailability,
  fetchAliDossierConfiguration, fetchFollowUps, fetchQuoteLeads, updateAliReservationChecklist,
  updateFollowUpStatus, type FollowUp, type FollowUpStatus,
} from "@/lib/api";
import { ApiError } from "@/lib/error";
import { cn } from "@/lib/utils";
import { getTenantUiConfig, isAliRentalTenant, tenantText } from "@/lib/tenant-ui";
import { quoteLeadConversationUrl } from "@/lib/direct-whatsapp-reply";
import { tenantKey } from "@/lib/query-keys";
import { tenantStorageKey } from "@/lib/tenant";

const statusLabels: Record<FollowUpStatus, string> = {
  active: "Active",
  missing_information: "Missing information",
  collecting: "Missing information",
  ready_to_call: "Ready to call",
  ready_to_quote: "Ready to quote",
  needs_an_answer: "Needs an answer",
  needs_human_answer: "Needs an answer",
  in_progress: "In progress",
  copied: "Copied",
  appointment_coordinated: "Appointment coordinated",
  no_answer: "No answer",
  closed: "Closed",
};

const spanishStatusLabels: Record<FollowUpStatus, string> = {
  active: "Activo",
  missing_information: "Faltan datos",
  collecting: "Faltan datos",
  ready_to_call: "Listo para llamar",
  ready_to_quote: "Listo para cotizar",
  needs_an_answer: "Necesita respuesta",
  needs_human_answer: "Necesita respuesta",
  in_progress: "En seguimiento",
  copied: "Copiado",
  appointment_coordinated: "Cita coordinada",
  no_answer: "No responde",
  closed: "Cerrado",
};

const statusStyles: Record<FollowUpStatus, string> = {
  active: "border-slate-200 bg-slate-50 text-slate-700",
  missing_information: "border-amber-200 bg-amber-50 text-amber-700",
  collecting: "border-amber-200 bg-amber-50 text-amber-700",
  ready_to_call: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ready_to_quote: "border-emerald-200 bg-emerald-50 text-emerald-700",
  needs_an_answer: "border-violet-200 bg-violet-50 text-violet-700",
  needs_human_answer: "border-violet-200 bg-violet-50 text-violet-700",
  in_progress: "border-blue-200 bg-blue-50 text-blue-700",
  copied: "border-emerald-600 bg-emerald-600 text-white",
  appointment_coordinated: "border-sky-200 bg-sky-50 text-sky-700",
  no_answer: "border-slate-200 bg-slate-100 text-slate-600",
  closed: "border-slate-200 bg-slate-100 text-slate-600",
};

const tabs: { label: string; statuses: FollowUpStatus[] }[] = [
  { label: "Active", statuses: ["collecting", "ready_to_call", "ready_to_quote", "needs_human_answer", "in_progress", "copied"] },
  { label: "Ready to call", statuses: ["ready_to_call", "ready_to_quote"] },
  { label: "Missing information", statuses: ["collecting"] },
  { label: "Needs an answer", statuses: ["needs_human_answer"] },
  { label: "In progress", statuses: ["in_progress"] },
  { label: "Copied", statuses: ["copied"] },
  { label: "Completed", statuses: ["appointment_coordinated", "no_answer"] },
  { label: "Archived", statuses: ["closed"] },
];

const rentalTabs: { label: string; statuses: FollowUpStatus[] }[] = [
  { label: "Active", statuses: ["active", "missing_information", "ready_to_quote", "needs_an_answer", "in_progress"] },
  { label: "Ready to quote", statuses: ["ready_to_quote"] },
  { label: "Missing information", statuses: ["missing_information"] },
  { label: "Needs an answer", statuses: ["needs_an_answer"] },
  { label: "In progress", statuses: ["in_progress"] },
];

const spanishTabLabels = [
  "Activos",
  "Listos para llamar",
  "Faltan datos",
  "Necesitan respuesta",
  "En seguimiento",
  "Copiados",
  "Finalizados",
  "Archivados",
] as const;

const followUpsQueueStateKey = () => tenantStorageKey("follow-ups-queue-state");

interface FollowUpsQueueState {
  activeTab: number;
  selectedId: number | string | null;
  scrollTop: number;
}

function readQueueState(): FollowUpsQueueState | null {
  try {
    const stored = window.sessionStorage.getItem(followUpsQueueStateKey());
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<FollowUpsQueueState>;
    if (
      typeof parsed.activeTab !== "number" ||
      parsed.activeTab < 0 ||
      parsed.activeTab >= tabs.length ||
      typeof parsed.scrollTop !== "number"
    ) {
      return null;
    }
    return {
      activeTab: parsed.activeTab,
      selectedId: typeof parsed.selectedId === "number" || typeof parsed.selectedId === "string"
        ? parsed.selectedId
        : null,
      scrollTop: Math.max(0, parsed.scrollTop),
    };
  } catch {
    return null;
  }
}

function writeQueueState(state: FollowUpsQueueState): void {
  try {
    window.sessionStorage.setItem(followUpsQueueStateKey(), JSON.stringify(state));
  } catch {
    // Queue restoration is a convenience; navigation still works if storage is unavailable.
  }
}

function rawProspectPhone(item: FollowUp): string {
  const candidates = [item.phone_raw, item.phone_normalized, item.conversation_id];
  return candidates.find((value) => value?.trim() && !/^[a-f0-9]{24}$/i.test(value.trim()))?.trim() ?? "";
}

function usablePhone(value?: string): string {
  if (!value || /^[a-f0-9]{24}$/i.test(value)) {
    return tenantText("Phone not provided", "Teléfono no facilitado");
  }
  return value;
}

function prospectPhone(item: FollowUp): string {
  return usablePhone(rawProspectPhone(item));
}

function callbackPreference(value: string): string {
  if (!value) return tenantText("Not provided", "No indicado");
  const spanish: Record<string, string> = {
    "any time": "A cualquier hora",
    afternoon: "Por la tarde",
    afternoons: "Por las tardes",
    "afternoons from 18:00": "Por las tardes a partir de las 18:00",
    "friday afternoon": "Viernes por la tarde",
    morning: "Por la mañana",
    mornings: "Por las mañanas",
    "weekdays, any time": "Entre semana, a cualquier hora",
    "wednesday or thursday afternoon": "Miércoles o jueves por la tarde",
  };
  return tenantText(value, spanish[value.trim().toLowerCase()] ?? value);
}

function provided(value?: string): string {
  return value?.trim() || tenantText("Not provided", "No indicado");
}

function prospectName(item: FollowUp): string {
  const collectedName = [item.first_name, item.surnames].filter(Boolean).join(" ");
  if (collectedName) return collectedName;
  const phone = rawProspectPhone(item);
  if (phone) return tenantText(`Contact ${phone}`, `Contacto ${phone}`);
  return tenantText("Unknown patient", "Contacto sin identificar");
}

function appointmentPreference(item: FollowUp): string {
  return provided(item.appointment_preference);
}

function sessionType(item: FollowUp): string {
  return provided(item.session_type);
}

function preferredClinic(item: FollowUp): string {
  return provided(item.preferred_clinic);
}

function formatProspectForMessaging(item: FollowUp): string {
  return [
    "*Nuevo contacto para llamada*",
    "",
    `*Nombre y apellidos:* ${prospectName(item)}`,
    `*Teléfono:* ${prospectPhone(item)}`,
    `*Horario preferido para la cita:* ${appointmentPreference(item)}`,
    `*Tipo de sesión:* ${sessionType(item)}`,
    `*Centro preferido:* ${preferredClinic(item)}`,
    `*Motivo de consulta (opcional):* ${provided(item.visit_reason)}`,
    `*Cuándo podemos localizarle:* ${callbackPreference(item.callback_preference)}`,
  ].join("\n");
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Copy command failed");
  } finally {
    textarea.remove();
  }
}

function initials(item: FollowUp): string {
  return `${item.first_name?.[0] ?? ""}${item.surnames?.[0] ?? ""}`.toUpperCase() || "?";
}

function received(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return tenantText("Recently", "Recientemente");
  return new Intl.DateTimeFormat(getTenantUiConfig().dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function followUpStatusLabel(status: FollowUpStatus): string {
  return tenantText(statusLabels[status], spanishStatusLabels[status]);
}

function followUpTabLabel(index: number, pageTabs = tabs): string {
  if (isAliRentalTenant()) return pageTabs[index].label;
  return tenantText(tabs[index].label, spanishTabLabels[index]);
}

const rentalFieldLabels: Record<string, string> = {
  customer_name: "Full name",
  phone: "Telephone",
  pickup_datetime: "Pickup date and time",
  return_datetime: "Return date and time",
  pickup_location: "Pickup location",
  return_location: "Return location",
  driver_age: "Driver's age",
  passenger_count: "Number of passengers",
  vehicle_preference: "Preferred vehicle/category",
};

function rentalMissingLabels(item: FollowUp): string[] {
  return (item.missing_fields ?? []).map(
    (key) => item.field_labels?.[key] || rentalFieldLabels[key] || key.replaceAll("_", " "),
  );
}

function postQuoteStatusLabel(item: FollowUp): string {
  const labels = {
    availability_pending: "Availability check requested",
    requirements_pending: "Rental checks in progress",
    alternative_required: "Alternative vehicle needed",
    declined: "Availability declined",
    ready_to_confirm: "Ready to confirm",
    confirmed: "Reservation confirmed",
    cancelled: "Reservation cancelled",
    superseded: "Reservation superseded",
  } as const;
  return item.post_quote_status ? labels[item.post_quote_status] : "Waiting for customer choice";
}

function checklistLabel(value?: string | null): string {
  const labels: Record<string, string> = {
    awaiting_external_check: "Awaiting external check",
    not_sent: "Not sent",
    sent_external: "Sent externally",
    not_requested: "Not requested",
    awaiting_manual_verification: "Awaiting manual verification",
    verified: "Verified",
    not_required: "Not required",
    rejected: "Rejected",
  };
  return value ? labels[value] ?? value.replaceAll("_", " ") : "Not started";
}

function formatRentalLead(item: FollowUp): string {
  return [
    "*Complete car-rental lead*",
    "",
    `*Full name:* ${prospectName(item)}`,
    `*Telephone:* ${prospectPhone(item)}`,
    `*Pickup:* ${provided(item.pickup_datetime)} at ${provided(item.pickup_location)}`,
    `*Return:* ${provided(item.return_datetime)} at ${provided(item.return_location)}`,
    `*Driver's age:* ${provided(String(item.driver_age ?? ""))}`,
    `*Passengers:* ${provided(String(item.passenger_count ?? ""))}`,
    `*Vehicle/category:* ${provided(item.vehicle_preference)}`,
    `*Flight number (optional):* ${provided(item.flight_number)}`,
    `*Luggage (optional):* ${provided(item.luggage)}`,
    `*Child seat (optional):* ${provided(item.child_seat)}`,
    `*Notes (optional):* ${provided(item.notes)}`,
  ].join("\n");
}

export default function FollowUps() {
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const isDespertares = getTenantUiConfig().locale === "es-ES";
  const isRental = isAliRentalTenant();
  const pageTabs = isRental ? rentalTabs : tabs;
  const initialQueueState = useRef(readQueueState()).current;
  const pageRef = useRef<HTMLDivElement>(null);
  const pendingScrollTopRef = useRef<number | null>(initialQueueState?.scrollTop ?? null);
  const [activeTab, setActiveTab] = useState(
    initialQueueState && initialQueueState.activeTab < pageTabs.length
      ? initialQueueState.activeTab
      : 0,
  );
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [selectedId, setSelectedId] = useState<number | string | null>(initialQueueState?.selectedId ?? null);
  const query = useQuery({
    queryKey: tenantKey(isRental ? "quote-leads" : "follow-ups"),
    queryFn: () => isRental ? fetchQuoteLeads() : fetchFollowUps(),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    staleTime: 0,
    gcTime: 0,
    structuralSharing: false,
  });
  const dossierConfiguration = useQuery({
    queryKey: tenantKey("ali-dossier-configuration"),
    queryFn: fetchAliDossierConfiguration,
    enabled: isRental,
    retry: false,
    staleTime: 30_000,
  });
  const rows = query.data ?? [];
  const visible = useMemo(
    () => rows.filter((row) => pageTabs[activeTab].statuses.includes(row.status)),
    [rows, activeTab, pageTabs],
  );
  const selected = rows.find((row) => row.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (visible.length && !visible.some((row) => row.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  useEffect(() => {
    if (query.isLoading || pendingScrollTopRef.current === null) return;
    const scrollContainer = pageRef.current?.closest("main");
    if (!(scrollContainer instanceof HTMLElement)) return;

    const scrollTop = pendingScrollTopRef.current;
    let innerFrame = 0;
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollTop;
        pendingScrollTopRef.current = null;
      });
    });

    return () => {
      window.cancelAnimationFrame(outerFrame);
      if (innerFrame) window.cancelAnimationFrame(innerFrame);
    };
  }, [query.isLoading, visible.length]);

  const update = useMutation({
    mutationFn: ({ id, status }: { id: number; status: FollowUpStatus }) =>
      updateFollowUpStatus(id, status),
    retry: (failureCount, error) =>
      failureCount < 1 &&
      (!(error instanceof ApiError) || error.status === 0 || error.status >= 500),
    onMutate: async (variables) => {
      await client.cancelQueries({ queryKey: tenantKey("follow-ups") });
      const previous = client.getQueryData<FollowUp[]>(tenantKey("follow-ups"));
      client.setQueryData<FollowUp[]>(tenantKey("follow-ups"), (current = []) =>
        current.map((item) =>
          item.id === variables.id ? { ...item, status: variables.status } : item,
        ),
      );
      return { previous };
    },
    onSuccess: (_, variables) => {
      client.invalidateQueries({ queryKey: tenantKey("follow-ups") });
      if (variables.status === "copied") return;
      if (variables.status === "closed") {
        toast.success(tenantText("Prospect archived.", "Prospecto archivado."));
        return;
      }
      toast.success(
        tenantText(
          `Status changed to ${statusLabels[variables.status]}`,
          `Estado cambiado a ${spanishStatusLabels[variables.status]}`,
        ),
      );
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        client.setQueryData(tenantKey("follow-ups"), context.previous);
      }
      toast.error(
        tenantText(
          "The follow-up could not be updated.",
          "No se pudo actualizar el seguimiento.",
        ),
      );
    },
  });

  const reservationAction = useMutation({
    mutationFn: async (action: {
      kind: "approve" | "decline" | "identity" | "agreement" | "payment" | "confirm";
      publicId: string;
      revision?: number | null;
    }) => {
      if (action.kind === "approve" || action.kind === "decline") {
        return decideAliReservationAvailability(
          action.publicId,
          action.kind,
          action.revision,
        );
      }
      if (action.kind === "confirm") {
        return confirmAliReservation(action.publicId, action.revision);
      }
      return updateAliReservationChecklist(
        action.publicId,
        action.kind,
        "verified",
        action.revision,
      );
    },
    onSuccess: async (_data, action) => {
      await client.invalidateQueries({ queryKey: tenantKey("quote-leads") });
      toast.success(
        action.kind === "confirm"
          ? "Reservation confirmed and customer confirmation prepared."
          : "Reservation workflow updated.",
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError && error.status === 409
          ? "This reservation changed. Refresh and review the latest status."
          : "The reservation could not be updated.",
      );
    },
  });

  const move = (status: FollowUpStatus) => {
    if (selected && typeof selected.id === "number") {
      update.mutate({ id: selected.id, status });
    }
  };
  const refresh = async () => {
    if (isManualRefreshing) return;
    setIsManualRefreshing(true);
    try {
      const result = await query.refetch({ cancelRefetch: true });
      if (result.error) throw result.error;
      toast.success(
        isRental ? `Queue refreshed — ${result.data?.length ?? 0} quote leads loaded.` : tenantText(
          `Queue refreshed — ${result.data?.length ?? 0} follow-ups loaded.`,
          `Cola actualizada: ${result.data?.length ?? 0} seguimientos cargados.`,
        ),
      );
    } catch {
      toast.error(
        tenantText(
          "The queue could not be refreshed. Please try again.",
          "No se pudo actualizar la cola. Inténtalo de nuevo.",
        ),
      );
    } finally {
      setIsManualRefreshing(false);
    }
  };
  const count = (index: number) =>
    rows.filter((row) => pageTabs[index].statuses.includes(row.status)).length;
  const openConversation = () => {
    if (!selected) return;
    const scrollContainer = pageRef.current?.closest("main");
    writeQueueState({
      activeTab,
      selectedId: selected.id,
      scrollTop: scrollContainer instanceof HTMLElement ? scrollContainer.scrollTop : 0,
    });
    navigate(quoteLeadConversationUrl(selected.conversation_id));
  };
  const copyProspect = async () => {
    if (!selected) return;
    try {
      await copyText(isRental ? formatRentalLead(selected) : formatProspectForMessaging(selected));
      setCopiedId(selected.id);
      if (!isRental && selected.status !== "copied") move("copied");
      window.setTimeout(() => setCopiedId((current) => current === selected.id ? null : current), 1600);
      toast.success(isRental ? "Rental lead copied." : tenantText("Prospect data copied.", "Datos del prospecto copiados."));
    } catch {
      toast.error(tenantText("The data could not be copied.", "No se pudieron copiar los datos."));
    }
  };
  const archiveRentalLead = async () => {
    if (!selected || !isRental) return;
    try {
      await archiveConversation(selected.conversation_id);
      setSelectedId(null);
      await query.refetch({ cancelRefetch: true });
      toast.success("Rental lead archived.");
    } catch {
      toast.error("The rental lead could not be archived.");
    }
  };

  return (
    <DashboardShell
      activeNav="followups"
      pageTitle={isRental ? "Quote leads" : tenantText("Follow-ups", "Seguimientos")}
      pageSubtitle={isRental ? "Complete rental requests" : tenantText("Patient callback requests", "Solicitudes de contacto")}
    >
      <div ref={pageRef} className="mx-auto w-full max-w-[1500px] space-y-6 p-4 md:p-7">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">
              {isRental ? "Rental lead queue" : tenantText("Patient care queue", "Cola de personas interesadas")}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {isRental ? "Complete quote requests" : tenantText("Patient follow-ups", "Seguimiento de personas interesadas")}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isRental ? (
                "Nick keeps the conversation moving from car choice to official quote and reservation."
              ) : tenantText(
                "Review each request, call the patient, and record the outcome.",
                "Revisa cada solicitud, contacta con la persona y registra el resultado.",
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:flex">
              <BellRing className="h-4 w-4" /> {tenantText("Live queue", "Cola en directo")}
            </span>
            <button
              type="button"
              onClick={refresh}
              disabled={isManualRefreshing}
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
              aria-label={
                isManualRefreshing
                  ? tenantText("Refreshing follow-ups", "Actualizando seguimientos")
                  : tenantText("Refresh follow-ups", "Actualizar seguimientos")
              }
              title={
                isManualRefreshing
                  ? tenantText("Refreshing…", "Actualizando…")
                  : tenantText("Refresh follow-ups", "Actualizar seguimientos")
              }
            >
              <RefreshCw className={cn("h-4 w-4", isManualRefreshing && "animate-spin")} />
            </button>
          </div>
        </header>

        <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {pageTabs.map((tab, index) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => {
                setActiveTab(index);
                setSelectedId(null);
              }}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium",
                activeTab === index
                  ? isDespertares
                    ? "rounded-t-xl border-x border-t border-emerald-200 border-b-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm"
                    : "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {followUpTabLabel(index, pageTabs)}
              <span className={cn(
                "ml-2 rounded-full px-2 py-0.5 text-xs",
                activeTab === index
                  ? isDespertares
                    ? "bg-emerald-600 text-white"
                    : "bg-primary/10"
                  : "bg-slate-100",
              )}>{count(index)}</span>
            </button>
          ))}
        </div>

        {query.isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
            {isRental ? "Loading quote leads…" : tenantText("Loading follow-ups…", "Cargando seguimientos…")}
          </div>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,.68fr)_minmax(0,1.32fr)] xl:grid-cols-[minmax(0,.62fr)_minmax(0,1.38fr)]">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>{isRental ? "Customer and rental" : tenantText("Patient and request", "Persona y solicitud")}</span>
                <span>{tenantText("Status", "Estado")}</span>
              </div>
              {visible.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  aria-pressed={selected?.id === item.id}
                  className={cn(
                    "grid min-h-[106px] w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-100 px-4 py-4 text-left last:border-0 hover:bg-slate-50",
                    selected?.id === item.id && "bg-blue-50/70 hover:bg-blue-50/70",
                  )}
                >
                  <span className="flex min-w-0 gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(item)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-800">{prospectName(item)}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{prospectPhone(item)}</span>
                      {isRental ? (
                        <>
                          <span className="mt-1 block truncate text-xs text-slate-400">
                            {item.vehicle_preference || "Vehicle/category not provided"}
                          </span>
                          <span className="mt-1.5 block truncate text-xs leading-5 text-slate-600">
                            <Clock3 className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                            {provided(item.pickup_datetime)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="mt-1 block truncate text-xs text-slate-400">
                            {item.visit_reason || tenantText("No reason provided", "Sin motivo indicado")}
                          </span>
                          <span className="mt-1.5 block truncate text-xs leading-5 text-slate-600">
                            <Clock3 className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                            {callbackPreference(item.callback_preference)}
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="pt-1">
                    <span className={cn("inline-flex max-w-[105px] rounded-full border px-2.5 py-1 text-[11px] font-medium leading-tight", statusStyles[item.status])}>
                      {followUpStatusLabel(item.status)}
                    </span>
                  </span>
                </button>
              ))}
              {!visible.length && (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  {isRental ? "No quote leads in this view." : tenantText("No follow-ups in this view.", "No hay seguimientos en esta vista.")}
                </div>
              )}
            </section>

            {selected ? (
              <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-6">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {isRental ? "Complete rental lead" : tenantText("Complete prospect file", "Ficha completa del prospecto")}
                    </p>
                    <span className={cn("mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", statusStyles[selected.status])}>
                      {followUpStatusLabel(selected.status)}
                    </span>
                    <h2 className="mt-3 truncate text-xl font-semibold text-slate-900">{prospectName(selected)}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {tenantText("Received", "Recibido el")} {received(selected.updated_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={copyProspect}
                    aria-label={isRental ? "Copy complete rental lead" : tenantText("Copy all prospect data", "Copiar todos los datos del prospecto")}
                    title={isRental ? "Copy complete rental lead" : tenantText("Copy all prospect data", "Copiar todos los datos del prospecto")}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    {selected.status === "copied" || copiedId === selected.id
                      ? <Check className="h-4 w-4" />
                      : <Copy className="h-4 w-4" />}
                  </button>
                </div>

                <div className="space-y-5 p-5 text-sm">
                  {isRental ? (
                    <>
                      {selected.reservation_public_id &&
                      dossierConfiguration.data?.enabled ? (
                        dossierConfiguration.data.ready ? (
                          <AliCustomerFile
                            key={selected.reservation_public_id}
                            publicId={selected.reservation_public_id}
                            enabled
                          />
                        ) : (
                          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                              Customer file activation blocked
                            </p>
                            <p className="mt-2 text-sm">
                              Complete the approved tenant configuration before
                              collecting customer documents.
                            </p>
                            <ul className="mt-3 space-y-1 text-xs text-amber-800">
                              {dossierConfiguration.data.blockers.map(
                                (blocker) => (
                                  <li key={blocker}>
                                    • {blocker.replaceAll("_", " ")}
                                  </li>
                                ),
                              )}
                            </ul>
                            <a
                              href="/rental"
                              className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-amber-400 px-4 text-sm font-semibold text-slate-950 hover:bg-amber-300"
                            >
                              Open rental settings
                            </a>
                          </section>
                        )
                      ) : (
                        <ReservationPipeline
                          item={selected}
                          busy={reservationAction.isPending}
                          onAction={(kind) => {
                            if (!selected.reservation_public_id) return;
                            reservationAction.mutate({
                              kind,
                              publicId: selected.reservation_public_id,
                              revision: selected.reservation_revision,
                            });
                          }}
                        />
                      )}
                      {!!rentalMissingLabels(selected).length && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                            Nick must keep asking
                          </p>
                          <p className="mt-1 text-amber-900">
                            Missing: {rentalMissingLabels(selected).join(", ")}
                          </p>
                          <p className="mt-2 text-xs text-amber-700">No quote can be sent yet.</p>
                        </div>
                      )}
                      {selected.complete && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Complete lead</p>
                          <p className="mt-1">All mandatory details are present. Nick can continue to summary confirmation and the official quote.</p>
                        </div>
                      )}
                      <div className="grid gap-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2">
                        <Detail icon={<UserRound />} label="Full name" value={prospectName(selected)} />
                        <Detail icon={<Phone />} label="Telephone" value={prospectPhone(selected)} />
                        <Detail icon={<CalendarClock />} label="Pickup date and time" value={provided(selected.pickup_datetime)} />
                        <Detail icon={<CalendarClock />} label="Return date and time" value={provided(selected.return_datetime)} />
                        <Detail icon={<MapPin />} label="Pickup location" value={provided(selected.pickup_location)} />
                        <Detail icon={<MapPin />} label="Return location" value={provided(selected.return_location)} />
                        <Detail icon={<UserRound />} label="Driver's age" value={provided(String(selected.driver_age ?? ""))} />
                        <Detail icon={<UsersRound />} label="Number of passengers" value={provided(String(selected.passenger_count ?? ""))} />
                        <Detail className="sm:col-span-2" icon={<Car />} label="Preferred vehicle/category" value={provided(selected.vehicle_preference)} />
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Optional details</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Detail icon={<BellRing />} label="Flight number" value={provided(selected.flight_number)} />
                          <Detail icon={<UsersRound />} label="Luggage" value={provided(selected.luggage)} />
                          <Detail icon={<UserRound />} label="Child seat" value={provided(selected.child_seat)} />
                          <Detail icon={<MessageCircle />} label="Notes" value={provided(selected.notes)} />
                        </div>
                      </div>
                      <div className="grid gap-3 rounded-xl border border-slate-100 bg-white p-4 sm:grid-cols-2">
                        <Detail icon={<CalendarClock />} label="Rental period" value={provided(selected.rental_period)} />
                        <Detail icon={<MessageCircle />} label="Unanswered messages" value={String(selected.unread_count ?? 0)} />
                        <Detail icon={<BellRing />} label="Next action" value={provided(selected.next_action)} />
                        <Detail icon={<Car />} label="Quote reference" value={provided(selected.quote_reference ?? "")} />
                        <Detail icon={<Clock3 />} label="Quote delivery" value={provided(selected.quote_delivery_state)} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid gap-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2">
                        <Detail icon={<UserRound />} label={tenantText("Name and surnames", "Nombre y apellidos")} value={prospectName(selected)} />
                        <Detail icon={<Phone />} label={tenantText("Phone", "Teléfono")} value={prospectPhone(selected)} />
                        <Detail icon={<CalendarClock />} label={tenantText("Preferred appointment time", "Horario preferido para la cita")} value={appointmentPreference(selected)} />
                        <Detail icon={<BellRing />} label={tenantText("Session type", "Tipo de sesión")} value={sessionType(selected)} />
                        <Detail icon={<MapPin />} label={tenantText("Preferred clinic", "Centro preferido")} value={preferredClinic(selected)} />
                        <Detail className="sm:col-span-2" icon={<Clock3 />} label={tenantText("When we can reach them", "Cuándo podemos localizarle")} value={callbackPreference(selected.callback_preference)} />
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {tenantText("Reason for contact (optional)", "Motivo de la consulta (opcional)")}
                        </p>
                        <p className="leading-relaxed text-slate-700">
                          {selected.visit_reason || tenantText("The patient has not provided a reason.", "La persona no ha indicado el motivo.")}
                        </p>
                      </div>
                    </>
                  )}

                  {(selected.status === "needs_an_answer" || selected.status === "needs_human_answer") && (
                    <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-violet-700">
                        {tenantText("Client question", "Pregunta de la persona")}
                      </p>
                      <p className="text-violet-900">
                        {tenantText(
                          "Open the conversation to review and answer the pending question.",
                          "Abre la conversación para revisar y responder la pregunta pendiente.",
                        )}
                      </p>
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {tenantText("Actions", "Acciones")}
                    </p>
                    <div
                      className={cn(
                        "grid gap-2",
                        (isDespertares || isRental) && selected.status !== "closed"
                          ? "grid-cols-1 sm:grid-cols-3"
                          : "grid-cols-2",
                      )}
                    >
                      <Action label={tenantText("Open conversation", "Abrir conversación")} icon={<MessageCircle />} onClick={openConversation} />
                      <Action
                        label={tenantText("Copied", "Copiado")}
                        icon={<Check />}
                        onClick={copyProspect}
                        selected={selected.status === "copied" || copiedId === selected.id}
                      />
                      {(isDespertares || isRental) && selected.status !== "closed" && (
                        <Action
                          label={tenantText("Archive", "Archivar")}
                          icon={<Archive />}
                          onClick={isRental ? archiveRentalLead : () => move("closed")}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </aside>
            ) : (
              <aside className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                {tenantText(
                  "Select a follow-up to view its details.",
                  "Selecciona un seguimiento para ver sus detalles.",
                )}
              </aside>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

type ReservationActionKind = "approve" | "decline" | "identity" | "agreement" | "payment" | "confirm";

function ReservationPipeline({
  item,
  busy,
  onAction,
}: {
  item: FollowUp;
  busy: boolean;
  onAction: (kind: ReservationActionKind) => void;
}) {
  const hasReservation = Boolean(item.reservation_public_id);
  const status = item.post_quote_status;
  const checklist = [
    { key: "identity" as const, icon: <ShieldCheck />, label: "Identity", value: item.identity_status },
    { key: "agreement" as const, icon: <FileCheck2 />, label: "Agreement", value: item.agreement_status },
    { key: "payment" as const, icon: <BadgeDollarSign />, label: "Payment", value: item.payment_status },
  ];
  const verified = (value?: string | null) => value === "verified" || value === "not_required";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white shadow-lg shadow-slate-200/60">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
              Post-quote reservation
            </p>
            <h3 className="mt-1 text-lg font-semibold">{postQuoteStatusLabel(item)}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              A quote is not a booking. Confirmation becomes available only after availability and every required check are verified.
            </p>
          </div>
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300">
            {status === "confirmed" ? <CheckCircle2 className="h-5 w-5" /> : <Car className="h-5 w-5" />}
          </span>
        </div>
      </div>

      {!hasReservation ? (
        <div className="px-5 py-4 text-sm text-slate-200">
          The customer has the quote choices. When they tap <strong className="text-white">Reserve this car</strong>, the availability request appears here automatically.
        </div>
      ) : (
        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {[
              ["Quote", true],
              ["Availability", item.availability_status === "approved"],
              ["Checks", checklist.every((entry) => verified(entry.value))],
              ["Confirmed", status === "confirmed"],
            ].map(([label, complete]) => (
              <div key={String(label)}>
                <span className={cn(
                  "mx-auto mb-1.5 block h-1.5 rounded-full",
                  complete ? "bg-emerald-400" : "bg-white/15",
                )} />
                {label}
              </div>
            ))}
          </div>

          {status === "availability_pending" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction("approve")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Approve availability
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction("decline")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" /> Decline
              </button>
            </div>
          )}

          {item.availability_status === "approved" && status !== "confirmed" && (
            <div className="space-y-2">
              {checklist.map((entry) => (
                <div key={entry.key} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="text-slate-300 [&>svg]:h-4 [&>svg]:w-4">{entry.icon}</span>
                    <span>
                      <span className="block text-sm font-medium">{entry.label}</span>
                      <span className="block text-xs text-slate-400">{checklistLabel(entry.value)}</span>
                    </span>
                  </span>
                  {!verified(entry.value) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onAction(entry.key)}
                      className="shrink-0 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-50"
                    >
                      Mark verified
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {status === "ready_to_confirm" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction("confirm")}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-bold text-slate-950 shadow-lg shadow-amber-950/20 transition hover:bg-amber-300 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> Confirm reservation and send document
            </button>
          )}

          {status === "confirmed" && (
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Confirmed reference</p>
              <p className="mt-1 font-mono text-sm font-semibold text-white">{item.reservation_reference || "Generated"}</p>
            </div>
          )}

          {status === "alternative_required" && (
            <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
              An alternative vehicle must be discussed with the customer before a new quote is confirmed.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Detail({ icon, label, value, className }: { icon: ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 gap-3", className)}>
      <span className="mt-0.5 shrink-0 text-slate-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-0.5 break-words font-medium text-slate-800">{value}</p></div>
    </div>
  );
}

function Action({ label, icon, onClick, selected }: { label: string; icon: ReactNode; onClick: () => void; selected?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition",
        selected
          ? "border-emerald-600 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
          : "border-slate-200 text-slate-700 hover:bg-slate-50",
      )}
    >
      <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>{label}
    </button>
  );
}
