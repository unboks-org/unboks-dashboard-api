import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  BellRing, CalendarClock, Check, ChevronRight, Clock3, MessageCircle,
  Phone, RefreshCw, UserRound, X,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import {
  fetchFollowUps, updateFollowUpStatus, type FollowUp, type FollowUpStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { getTenantUiConfig, tenantText } from "@/lib/tenant-ui";

const statusLabels: Record<FollowUpStatus, string> = {
  collecting: "Missing information",
  ready_to_call: "Ready to call",
  needs_human_answer: "Needs an answer",
  in_progress: "In progress",
  appointment_coordinated: "Appointment coordinated",
  no_answer: "No answer",
  closed: "Closed",
};

const spanishStatusLabels: Record<FollowUpStatus, string> = {
  collecting: "Faltan datos",
  ready_to_call: "Listo para llamar",
  needs_human_answer: "Necesita respuesta",
  in_progress: "En seguimiento",
  appointment_coordinated: "Cita coordinada",
  no_answer: "No responde",
  closed: "Cerrado",
};

const statusStyles: Record<FollowUpStatus, string> = {
  collecting: "border-amber-200 bg-amber-50 text-amber-700",
  ready_to_call: "border-emerald-200 bg-emerald-50 text-emerald-700",
  needs_human_answer: "border-violet-200 bg-violet-50 text-violet-700",
  in_progress: "border-blue-200 bg-blue-50 text-blue-700",
  appointment_coordinated: "border-sky-200 bg-sky-50 text-sky-700",
  no_answer: "border-slate-200 bg-slate-100 text-slate-600",
  closed: "border-slate-200 bg-slate-100 text-slate-600",
};

const tabs: { label: string; statuses: FollowUpStatus[] }[] = [
  { label: "Active", statuses: ["collecting", "ready_to_call", "needs_human_answer", "in_progress"] },
  { label: "Ready to call", statuses: ["ready_to_call"] },
  { label: "Missing information", statuses: ["collecting"] },
  { label: "Needs an answer", statuses: ["needs_human_answer"] },
  { label: "In progress", statuses: ["in_progress"] },
  { label: "Completed", statuses: ["appointment_coordinated", "no_answer"] },
  { label: "Archived", statuses: ["closed"] },
];

const spanishTabLabels = [
  "Activos",
  "Listos para llamar",
  "Faltan datos",
  "Necesitan respuesta",
  "En seguimiento",
  "Finalizados",
  "Archivados",
] as const;

const FOLLOW_UPS_QUEUE_STATE_KEY = "unboks:follow-ups:queue-state";

interface FollowUpsQueueState {
  activeTab: number;
  selectedId: number | null;
  scrollTop: number;
}

function readQueueState(): FollowUpsQueueState | null {
  try {
    const stored = window.sessionStorage.getItem(FOLLOW_UPS_QUEUE_STATE_KEY);
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
      selectedId: typeof parsed.selectedId === "number" ? parsed.selectedId : null,
      scrollTop: Math.max(0, parsed.scrollTop),
    };
  } catch {
    return null;
  }
}

function writeQueueState(state: FollowUpsQueueState): void {
  try {
    window.sessionStorage.setItem(FOLLOW_UPS_QUEUE_STATE_KEY, JSON.stringify(state));
  } catch {
    // Queue restoration is a convenience; navigation still works if storage is unavailable.
  }
}

function usablePhone(value: string): string {
  if (!value || /^[a-f0-9]{24}$/i.test(value)) {
    return tenantText("Phone not provided", "Teléfono no facilitado");
  }
  return value;
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

function followUpTabLabel(index: number): string {
  return tenantText(tabs[index].label, spanishTabLabels[index]);
}

export default function FollowUps() {
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const initialQueueState = useRef(readQueueState()).current;
  const pageRef = useRef<HTMLDivElement>(null);
  const pendingScrollTopRef = useRef<number | null>(initialQueueState?.scrollTop ?? null);
  const [activeTab, setActiveTab] = useState(initialQueueState?.activeTab ?? 0);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(initialQueueState?.selectedId ?? null);
  const query = useQuery({
    queryKey: ["follow-ups"],
    queryFn: () => fetchFollowUps(),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  const rows = query.data ?? [];
  const visible = useMemo(
    () => rows.filter((row) => tabs[activeTab].statuses.includes(row.status)),
    [rows, activeTab],
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
    onSuccess: (_, variables) => {
      client.invalidateQueries({ queryKey: ["follow-ups"] });
      toast.success(
        tenantText(
          `Status changed to ${statusLabels[variables.status]}`,
          `Estado cambiado a ${spanishStatusLabels[variables.status]}`,
        ),
      );
    },
    onError: () =>
      toast.error(
        tenantText(
          "The follow-up could not be updated.",
          "No se pudo actualizar el seguimiento.",
        ),
      ),
  });

  const move = (status: FollowUpStatus) => {
    if (selected) update.mutate({ id: selected.id, status });
  };
  const refresh = async () => {
    if (isManualRefreshing) return;
    setIsManualRefreshing(true);
    try {
      const result = await query.refetch({ cancelRefetch: true });
      if (result.error) throw result.error;
      toast.success(
        tenantText(
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
    rows.filter((row) => tabs[index].statuses.includes(row.status)).length;
  const openConversation = () => {
    if (!selected) return;
    const scrollContainer = pageRef.current?.closest("main");
    writeQueueState({
      activeTab,
      selectedId: selected.id,
      scrollTop: scrollContainer instanceof HTMLElement ? scrollContainer.scrollTop : 0,
    });
    navigate(`/?c=${encodeURIComponent(selected.conversation_id)}&from=follow-ups`);
  };

  return (
    <DashboardShell
      activeNav="followups"
      pageTitle={tenantText("Follow-ups", "Seguimientos")}
      pageSubtitle={tenantText("Patient callback requests", "Solicitudes de llamada a pacientes")}
    >
      <div ref={pageRef} className="mx-auto w-full max-w-[1500px] space-y-6 p-4 md:p-7">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">
              {tenantText("Patient care queue", "Cola de atención al paciente")}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {tenantText("Patient follow-ups", "Seguimientos de pacientes")}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {tenantText(
                "Review each request, call the patient, and record the outcome.",
                "Revisa cada solicitud, llama al paciente y registra el resultado.",
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
          {tabs.map((tab, index) => (
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
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {followUpTabLabel(index)}
              <span className={cn(
                "ml-2 rounded-full px-2 py-0.5 text-xs",
                activeTab === index ? "bg-primary/10" : "bg-slate-100",
              )}>{count(index)}</span>
            </button>
          ))}
        </div>

        {query.isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
            {tenantText("Loading follow-ups…", "Cargando seguimientos…")}
          </div>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(145px,.75fr)_120px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>{tenantText("Patient and request", "Paciente y solicitud")}</span>
                <span>{tenantText("Callback", "Llamada")}</span>
                <span>{tenantText("Status", "Estado")}</span>
              </div>
              {visible.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  aria-pressed={selected?.id === item.id}
                  className={cn(
                    "grid min-h-[92px] w-full grid-cols-[minmax(0,1.25fr)_minmax(145px,.75fr)_120px] gap-4 border-b border-slate-100 px-5 py-4 text-left last:border-0 hover:bg-slate-50",
                    selected?.id === item.id && "bg-blue-50/70 hover:bg-blue-50/70",
                  )}
                >
                  <span className="flex min-w-0 gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(item)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-800">
                        {[item.first_name, item.surnames].filter(Boolean).join(" ") ||
                          tenantText("Unknown patient", "Paciente desconocido")}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{usablePhone(item.phone_raw)}</span>
                      <span className="mt-1 block truncate text-xs text-slate-400">
                        {item.visit_reason || tenantText("No reason provided", "Sin motivo indicado")}
                      </span>
                    </span>
                  </span>
                  <span className="pt-1 text-xs leading-5 text-slate-600">
                    <Clock3 className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                    {callbackPreference(item.callback_preference)}
                    <span className="mt-1 block text-slate-400">
                      {item.channel === "whatsapp" ? "WhatsApp" : item.channel}
                    </span>
                  </span>
                  <span className="pt-1">
                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium leading-tight", statusStyles[item.status])}>
                      {followUpStatusLabel(item.status)}
                    </span>
                  </span>
                </button>
              ))}
              {!visible.length && (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  {tenantText("No follow-ups in this view.", "No hay seguimientos en esta vista.")}
                </div>
              )}
            </section>

            {selected ? (
              <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-6">
                <div className="flex items-start justify-between border-b border-slate-100 p-5">
                  <div>
                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", statusStyles[selected.status])}>
                      {followUpStatusLabel(selected.status)}
                    </span>
                    <h2 className="mt-3 text-xl font-semibold text-slate-900">
                      {[selected.first_name, selected.surnames].filter(Boolean).join(" ") ||
                        tenantText("Unknown patient", "Paciente desconocido")}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {tenantText("Received", "Recibido el")} {received(selected.updated_at)}
                    </p>
                  </div>
                </div>

                <div className="space-y-5 p-5 text-sm">
                  <div className="space-y-3">
                    <Detail
                      icon={<Phone />}
                      label={tenantText("Phone", "Teléfono")}
                      value={usablePhone(selected.phone_raw)}
                    />
                    <Detail
                      icon={<CalendarClock />}
                      label={tenantText("Best callback time", "Mejor momento para llamar")}
                      value={callbackPreference(selected.callback_preference)}
                    />
                    <Detail
                      icon={<MessageCircle />}
                      label={tenantText("Channel", "Canal")}
                      value={selected.channel === "whatsapp" ? "WhatsApp" : selected.channel}
                    />
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {tenantText("Reason for contact", "Motivo de la consulta")}
                    </p>
                    <p className="leading-relaxed text-slate-700">
                      {selected.visit_reason ||
                        tenantText(
                          "The patient has not provided a reason.",
                          "El paciente no ha indicado el motivo.",
                        )}
                    </p>
                  </div>

                  {selected.status === "needs_human_answer" && (
                    <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-violet-700">
                        {tenantText("Client question", "Pregunta del paciente")}
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
                    <div className="grid grid-cols-2 gap-2">
                      <Action label={tenantText("Open conversation", "Abrir conversación")} icon={<MessageCircle />} onClick={openConversation} />
                      <Action label={tenantText("Assign to me", "Asignarme")} icon={<UserRound />} onClick={() => move("in_progress")} />
                      <Action label={tenantText("No answer", "No responde")} icon={<X />} onClick={() => move("no_answer")} />
                      <Action label={tenantText("Call in progress", "Llamada en curso")} icon={<Phone />} onClick={() => move("in_progress")} />
                      <Action label={tenantText("Appointment coordinated", "Cita coordinada")} icon={<Check />} onClick={() => move("appointment_coordinated")} primary />
                      <Action label={tenantText("Close follow-up", "Cerrar seguimiento")} icon={<ChevronRight />} onClick={() => move("closed")} />
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

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-slate-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <div><p className="text-xs text-slate-500">{label}</p><p className="mt-0.5 font-medium text-slate-800">{value}</p></div>
    </div>
  );
}

function Action({ label, icon, onClick, primary }: { label: string; icon: ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium",
        primary
          ? "border-primary bg-primary text-white hover:bg-primary/90"
          : "border-slate-200 text-slate-700 hover:bg-slate-50",
      )}
    >
      <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>{label}
    </button>
  );
}
