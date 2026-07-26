import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, RefreshCw } from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { fetchFollowUps, updateFollowUpStatus, type FollowUpStatus } from "@/lib/api";

const labels: Record<FollowUpStatus, string> = {
  collecting: "Missing details", ready_to_call: "Ready to call",
  needs_human_answer: "Needs answer", in_progress: "In progress",
  appointment_coordinated: "Appointment coordinated", no_answer: "No answer", closed: "Closed",
};

export default function FollowUps() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["follow-ups"], queryFn: () => fetchFollowUps(), refetchInterval: 10_000 });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: number; status: FollowUpStatus }) => updateFollowUpStatus(id, status),
    onSuccess: () => client.invalidateQueries({ queryKey: ["follow-ups"] }),
  });
  const rows = query.data ?? [];
  return <DashboardShell activeNav="followups" pageTitle="Follow-ups" pageSubtitle="Patient callback requests">
    <main className="mx-auto w-full max-w-6xl p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Follow-ups</h1><p className="text-sm text-muted-foreground">The team coordinates appointments by phone.</p></div><button className="rounded-lg border p-2" onClick={() => query.refetch()} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button></div>
      {query.isLoading ? <p className="text-muted-foreground">Loading follow-ups…</p> : rows.length === 0 ? <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No patient follow-ups yet.</div> :
        <div className="overflow-hidden rounded-xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Patient</th><th className="p-3">Callback</th><th className="p-3">Reason</th><th className="p-3">Status</th><th className="p-3" /></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t"><td className="p-3 font-medium">{`${row.first_name} ${row.surnames}`.trim() || "Unknown"}<div className="font-normal text-muted-foreground">{row.phone_raw}</div></td><td className="p-3">{row.callback_preference || "Not provided"}</td><td className="p-3">{row.visit_reason || "Not provided"}</td><td className="p-3">{labels[row.status]}</td><td className="p-3"><button disabled={update.isPending} onClick={() => update.mutate({ id: row.id, status: row.status === "ready_to_call" ? "in_progress" : "closed" })} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2"><Phone className="h-4 w-4" />{row.status === "ready_to_call" ? "Start call" : "Close"}</button></td></tr>)}</tbody></table></div>}
    </main>
  </DashboardShell>;
}
