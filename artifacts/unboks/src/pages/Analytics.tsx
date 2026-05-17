import { useMemo } from "react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { useConversations, useEscalations, useStatus } from "@/hooks/use-client-api";
import { mapApiConversation } from "@/lib/conversation-mapper";
import type { Channel } from "@/data/conversations";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const CHANNEL_COLORS: Record<string, string> = {
  WhatsApp: "#25d366",
  Email: "#1a73e8",
  Instagram: "#c13584",
  Facebook: "#1877f2",
  X: "#202124",
  TikTok: "#010101",
  Messenger: "#0084ff",
  Telegram: "#0088cc",
  Unknown: "#9aa0a6",
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-[#e8eaed] rounded-xl p-5">
      <p className="text-[12px] text-[#5f6368] uppercase tracking-wider">{label}</p>
      <p className="text-[28px] font-semibold text-[#202124] mt-1">{value}</p>
      {sub && <p className="text-[12px] text-[#5f6368] mt-0.5">{sub}</p>}
    </div>
  );
}

function parseRelativeDate(ts: string): Date | null {
  const now = new Date();
  if (/AM|PM/.test(ts)) return now;
  if (/yesterday/i.test(ts)) {
    const d = new Date(now); d.setDate(d.getDate() - 1); return d;
  }
  try { return new Date(ts + " " + now.getFullYear()); } catch { return null; }
}

export default function Analytics() {
  const { data: apiConversations, isLoading: convLoading, isError: convError } = useConversations();
  const { data: escalations, isLoading: escLoading } = useEscalations();
  const { data: status } = useStatus();

  const conversations = useMemo(() => {
    if (convError || !apiConversations) return [];
    return apiConversations.map(mapApiConversation);
  }, [apiConversations, convError]);

  const channelData = useMemo(() => {
    const counts: Partial<Record<Channel, number>> = {};
    conversations.forEach((c) => { counts[c.channel] = (counts[c.channel] || 0) + 1; });
    return (Object.entries(counts) as [Channel, number][])
      .sort((a, b) => b[1] - a[1]);
  }, [conversations]);

  const openEscalations = useMemo(
    () => escalations?.filter((e) => !e.resolved).length ?? conversations.filter((c) => c.escalated).length,
    [escalations, conversations],
  );
  const resolvedEscalations = useMemo(
    () => escalations?.filter((e) => e.resolved).length ?? 0,
    [escalations],
  );

  const trendData = useMemo(() => {
    const now = new Date();
    const days: { label: string; count: number; date: Date }[] = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (13 - i));
      return { label: d.toLocaleDateString("en", { weekday: "short" }), count: 0, date: d };
    });
    conversations.forEach((c) => {
      const date = parseRelativeDate(c.timestamp);
      if (!date) return;
      const dayIdx = days.findIndex((d) => d.date.toDateString() === date.toDateString());
      if (dayIdx >= 0) days[dayIdx].count++;
    });
    return days.map((d) => ({ label: d.label, count: d.count }));
  }, [conversations]);

  return (
    <DashboardShell
      activeNav="analytics"
      pageTitle="Analytics"
      pageSubtitle={
        (convLoading || escLoading)
          ? "Loading…"
          : convError
            ? "Couldn't load"
            : "Conversation and escalation insights"
      }
    >
      <div className="px-4 py-5 max-w-4xl space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Conversations" value={conversations.length} sub="total" />
          <StatCard label="Open escalations" value={status?.openEscalations ?? openEscalations} sub="pending review" />
          <StatCard label="Resolved" value={resolvedEscalations} sub="escalations closed" />
          <StatCard label="Orders detected" value="—" sub="TODO: paid-order endpoint" />
        </div>

        <div>
          <h3 className="text-[13px] font-medium text-[#5f6368] uppercase tracking-wider mb-3">Messages by channel</h3>
          {channelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={channelData.map(([ch, count]) => ({ channel: ch, count }))} barCategoryGap="30%">
                <XAxis dataKey="channel" tick={{ fontSize: 12, fill: "#5f6368" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#5f6368" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ border: "1px solid #e8eaed", borderRadius: 8, fontSize: 13 }} cursor={{ fill: "#f6f8fc" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {channelData.map(([ch]) => (
                    <Cell key={ch} fill={CHANNEL_COLORS[ch] ?? "#1a73e8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[13px] text-[#9aa0a6]">No channel data available.</p>
          )}
        </div>

        <div>
          <h3 className="text-[13px] font-medium text-[#5f6368] uppercase tracking-wider mb-3">14-day activity</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={trendData} barCategoryGap="20%">
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9aa0a6" }} axisLine={false} tickLine={false} />
              <YAxis hide allowDecimals={false} />
              <Tooltip contentStyle={{ border: "1px solid #e8eaed", borderRadius: 8, fontSize: 13 }} cursor={{ fill: "#f6f8fc" }} />
              <Bar dataKey="count" fill="#1a73e8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {status && (
          <div className="bg-[#f6f8fc] rounded-xl p-4">
            <p className="text-[12px] font-medium text-[#5f6368] uppercase tracking-wider mb-2">System Status</p>
            <div className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full ${status.status === "ok" ? "bg-[#34a853]" : "bg-[#ea4335]"}`} />
              <span className="text-[13px] text-[#202124] capitalize">{status.status}</span>
              {status.uptime && <span className="text-[12px] text-[#5f6368]">• Uptime: {status.uptime}</span>}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
