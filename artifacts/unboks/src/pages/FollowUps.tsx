import { useEffect, useMemo, useState, type ReactNode } from "react";
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

const statusLabels: Record<FollowUpStatus, string> = {
  collecting: "Missing information",
  ready_to_call: "Ready to call",
  needs_human_answer: "Needs an answer",
  in_progress: "In progress",
  appointment_coordinated: "Appointment coordinated",
  no_answer: "No answer",
  closed: "Closed",
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
  { label: "All", statuses: ["collecting", "ready_to_call", "needs_human_answer", "in_progress", "appointment_coordinated", "no_answer", "closed"] },
  { label: "Ready to call", statuses: ["ready_to_call"] },
  { label: "Missing information", statuses: ["collecting"] },
  { label: "Needs an answer", statuses: ["needs_human_answer"] },
  { label: "In progress", statuses: ["in_progress"] },
  { label: "Completed", statuses: ["appointment_coordinated", "no_answer", "closed"] },
];

function usablePhone(value: string): string {
  if (!value || /^[a-f0-9]{24}$/i.test(value)) return "Phone not provided";
  return value;
}

function initials(item: FollowUp): string {
  return `${item.first_name?.[0] ?? ""}${item.surnames?.[0] ?? ""}`.toUpperCase() || "?";
}

function received(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function FollowUps() {
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
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

  const update = useMutation({
    mutationFn: ({ id, status }: { id: number; status: FollowUpStatus }) =>
      updateFollowUpStatus(id, status),
    onSuccess: (_, variables) => {
      client.invalidateQueries({ queryKey: ["follow-ups"] });
      toast.success(`Status changed to ${statusLabels[variables.status]}`);
    },
    onError: () => toast.error("The follow-up could not be updated."),
  });

  const move = (status: FollowUpStatus) => {
    if (selected) update.mutate({ id: selected.id, status });
  };
  const count = (index: number) =>
    rows.filter((row) => tabs[index].statuses.includes(row.status)).length;

  return (
    <DashboardShell
      activeNav="followups"
      pageTitle="Follow-ups"
      pageSubtitle="Patient callback requests"
    >
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 md:p-7">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">Patient care queue</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Patient follow-ups</h1>
            <p className="mt-1 text-sm text-slate-500">Review each request, call the patient, and record the outcome.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:flex">
              <BellRing className="h-4 w-4" /> Live queue
            </span>
            <button
              onClick={() => query.refetch()}
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50"
              aria-label="Refresh follow-ups"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {tabs.map((tab, index) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(index)}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium",
                activeTab === index
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {tab.label}
              <span className={cn(
                "ml-2 rounded-full px-2 py-0.5 text-xs",
                activeTab === index ? "bg-primary/10" : "bg-slate-100",
              )}>{count(index)}</span>
            </button>
          ))}
        </div>

        {query.isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">Loading follow-ups…</div>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(145px,.75fr)_120px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>Patient and request</span><span>Callback</span><span>Status</span>
              </div>
              {visible.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    "grid min-h-[92px] w-full grid-cols-[minmax(0,1.25fr)_minmax(145px,.75fr)_120px] gap-4 border-b border-slate-100 px-5 py-4 text-left last:border-0 hover:bg-slate-50",
                    selected?.id === item.id && "bg-blue-50/70 hover:bg-blue-50/70",
                  )}
                >
                  <span className="flex min-w-0 gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(item)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-800">
                        {[item.first_name, item.surnames].filter(Boolean).join(" ") || "Unknown patient"}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{usablePhone(item.phone_raw)}</span>
                      <span className="mt-1 block truncate text-xs text-slate-400">{item.visit_reason || "No reason provided"}</span>
                    </span>
                  </span>
                  <span className="pt-1 text-xs leading-5 text-slate-600">
                    <Clock3 className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                    {item.callback_preference || "Not provided"}
                    <span className="mt-1 block text-slate-400">{item.channel === "whatsapp" ? "WhatsApp" : item.channel}</span>
                  </span>
                  <span className="pt-1">
                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium leading-tight", statusStyles[item.status])}>
                      {statusLabels[item.status]}
                    </span>
                  </span>
                </button>
              ))}
              {!visible.length && (
                <div className="px-6 py-16 text-center text-sm text-slate-500">No follow-ups in this view.</div>
              )}
            </section>

            {selected ? (
              <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-6">
                <div className="flex items-start justify-between border-b border-slate-100 p-5">
                  <div>
                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", statusStyles[selected.status])}>
                      {statusLabels[selected.status]}
                    </span>
                    <h2 className="mt-3 text-xl font-semibold text-slate-900">
                      {[selected.first_name, selected.surnames].filter(Boolean).join(" ") || "Unknown patient"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">Received {received(selected.updated_at)}</p>
                  </div>
                </div>

                <div className="space-y-5 p-5 text-sm">
                  <div className="space-y-3">
                    <Detail icon={<Phone />} label="Phone" value={usablePhone(selected.phone_raw)} />
                    <Detail icon={<CalendarClock />} label="Best callback time" value={selected.callback_preference || "Not provided"} />
                    <Detail icon={<MessageCircle />} label="Channel" value={selected.channel === "whatsapp" ? "WhatsApp" : selected.channel} />
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Reason for contact</p>
                    <p className="leading-relaxed text-slate-700">{selected.visit_reason || "The patient has not provided a reason."}</p>
                  </div>

                  {selected.status === "needs_human_answer" && (
                    <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-violet-700">Client question</p>
                      <p className="text-violet-900">Open the conversation to review and answer the pending question.</p>
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Action label="Open conversation" icon={<MessageCircle />} onClick={() => navigate(`/?c=${encodeURIComponent(selected.conversation_id)}`)} />
                      <Action label="Assign to me" icon={<UserRound />} onClick={() => move("in_progress")} />
                      <Action label="No answer" icon={<X />} onClick={() => move("no_answer")} />
                      <Action label="Call in progress" icon={<Phone />} onClick={() => move("in_progress")} />
                      <Action label="Appointment coordinated" icon={<Check />} onClick={() => move("appointment_coordinated")} primary />
                      <Action label="Close follow-up" icon={<ChevronRight />} onClick={() => move("closed")} />
                    </div>
                  </div>
                </div>
              </aside>
            ) : (
              <aside className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                Select a follow-up to view its details.
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
