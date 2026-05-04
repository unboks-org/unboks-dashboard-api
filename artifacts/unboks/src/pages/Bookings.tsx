import { useState } from "react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { useEscalations, useEscalationMutations, useConversations } from "@/hooks/use-client-api";
import { useBookingsLabel } from "@/hooks/use-bookings-label";
import { mapApiConversation } from "@/lib/conversation-mapper";
import { cn } from "@/lib/utils";
import { X, CheckCircle, MessageCircle, Clock, User, AlertCircle } from "lucide-react";
import type { Escalation } from "@/lib/api";
import { conversations as MOCK } from "@/data/conversations";

function avatarColor(name: string) {
  const colors = ["#f9a825","#1a73e8","#34a853","#ea4335","#7e57c2","#ec407a","#26a69a"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

interface OrderRow {
  id: string;
  customerName: string;
  contact: string;
  service: string;
  channel: string;
  date: string;
  resolved: boolean;
  summary: string;
}

function escalationToOrder(e: Escalation): OrderRow {
  return {
    id: e.id,
    customerName: e.customerName,
    contact: e.phone ?? "—",
    service: e.issue,
    channel: e.platform,
    date: e.createdAt,
    resolved: e.resolved,
    summary: e.issue,
  };
}

function DetailPanel({ order, onClose, onResolve, resolving }: {
  order: OrderRow;
  onClose: () => void;
  onResolve: () => void;
  resolving: boolean;
}) {
  const color = avatarColor(order.customerName);
  return (
    <div className="fixed inset-0 z-30 flex md:relative md:inset-auto md:w-[420px] md:border-l md:border-[#f1f3f4]">
      <div className="absolute inset-0 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white w-full max-w-[420px] ml-auto h-full flex flex-col shadow-xl md:shadow-none overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f3f4] flex-shrink-0">
          <h3 className="text-[15px] font-medium text-[#202124]">Order Detail</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f6f8fc] text-[#5f6368]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 px-5 py-5 space-y-5">
          <section>
            <p className="text-[11px] uppercase tracking-wider text-[#5f6368] mb-3">Customer</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[15px] font-medium flex-shrink-0" style={{ backgroundColor: color }}>
                {initial(order.customerName)}
              </div>
              <div>
                <p className="text-[14px] font-medium text-[#202124]">{order.customerName}</p>
                <p className="text-[13px] text-[#5f6368]">{order.contact}</p>
              </div>
            </div>
          </section>
          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-[#5f6368]">Order / Service</p>
            <div className="bg-[#f6f8fc] rounded-lg p-3">
              <p className="text-[13px] text-[#202124]">{order.service}</p>
            </div>
          </section>
          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-[#5f6368]">Details</p>
            <div className="space-y-1.5">
              <Row icon={MessageCircle} label="Channel" value={order.channel} />
              <Row icon={Clock} label="Date" value={order.date} />
              <Row icon={User} label="Contact" value={order.contact} />
              <Row icon={AlertCircle} label="Status" value={order.resolved ? "Resolved" : "Pending handoff"} />
            </div>
          </section>
          <section>
            <p className="text-[11px] uppercase tracking-wider text-[#5f6368] mb-2">AI Summary</p>
            <div className="bg-[#e8f0fe] rounded-lg p-3">
              <p className="text-[13px] text-[#3c4043] leading-relaxed">{order.summary}</p>
            </div>
          </section>
          <section>
            <p className="text-[11px] uppercase tracking-wider text-[#5f6368] mb-2">Next Action</p>
            <p className="text-[13px] text-[#202124]">
              {order.resolved
                ? "This order has been handled."
                : "Review the order details and confirm onboarding steps with the customer."}
            </p>
          </section>
        </div>
        <div className="px-5 py-4 border-t border-[#f1f3f4] flex gap-3 flex-shrink-0">
          <button
            onClick={onResolve}
            disabled={order.resolved || resolving}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[14px] font-medium transition-colors",
              order.resolved
                ? "bg-[#f6f8fc] text-[#5f6368] cursor-default"
                : "bg-[#1a73e8] hover:bg-[#1557b0] text-white",
            )}
          >
            <CheckCircle className="w-4 h-4" />
            {order.resolved ? "Resolved" : resolving ? "Resolving…" : "Mark as handled"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-[#5f6368] flex-shrink-0" />
      <span className="text-[13px] text-[#5f6368] w-20 flex-shrink-0">{label}</span>
      <span className="text-[13px] text-[#202124]">{value}</span>
    </div>
  );
}

export default function Bookings() {
  const { label } = useBookingsLabel();
  const { data: escalations, isLoading, isError } = useEscalations();
  const { data: conversations } = useConversations();
  const { resolve } = useEscalationMutations();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mappedConversations = conversations
    ? conversations.map(mapApiConversation)
    : MOCK;

  const orders: OrderRow[] = (() => {
    if (escalations && escalations.length > 0) {
      return escalations.map(escalationToOrder);
    }
    return mappedConversations
      .filter((c) => /booking|order|payment|paid|service|sign.?up|purchas/i.test(c.subject + " " + c.preview))
      .map((c) => ({
        id: c.id,
        customerName: c.sender,
        contact: c.channel,
        service: c.subject,
        channel: c.channel,
        date: c.timestamp,
        resolved: false,
        summary: c.preview,
      }));
  })();

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  return (
    <DashboardShell
      activeNav="bookings"
      pageTitle={label}
      titleSuffix={
        isLoading ? <span className="text-[12px] text-[#1a73e8]">Loading…</span>
          : isError ? <span className="text-[12px] text-[#d93025]">(preview mode)</span>
          : null
      }
    >
      <div className="flex h-full">
        <div className={cn("flex-1 overflow-y-auto", selected && "hidden md:block")}>
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <p className="text-[14px] text-[#5f6368]">No order handoffs to show.</p>
              <p className="text-[12px] text-[#9aa0a6] mt-1">Paid orders escalated by Marina will appear here.</p>
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                onClick={() => setSelectedId(order.id)}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 border-b border-[#f1f3f4] cursor-pointer hover:bg-[#f6f8fc] active:bg-[#eef1f6]",
                  selectedId === order.id && "bg-[#e8f0fe]",
                )}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[15px] font-medium flex-shrink-0" style={{ backgroundColor: avatarColor(order.customerName) }}>
                  {initial(order.customerName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-semibold text-[#202124] truncate">{order.customerName}</span>
                    <span className="text-[12px] text-[#5f6368] flex-shrink-0">{order.date}</span>
                  </div>
                  <p className="text-[14px] text-[#202124] truncate mt-0.5">{order.service}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      "text-[11px] px-2 py-0.5 rounded-full",
                      order.resolved ? "bg-[#e6f4ea] text-[#137333]" : "bg-[#fce8e6] text-[#c5221f]",
                    )}>
                      {order.resolved ? "Handled" : "Pending"}
                    </span>
                    <span className="text-[12px] text-[#5f6368]">{order.channel}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {selected && (
          <DetailPanel
            order={selected}
            onClose={() => setSelectedId(null)}
            onResolve={() => resolve.mutate(selected.id, { onSuccess: () => setSelectedId(null) })}
            resolving={resolve.isPending}
          />
        )}
      </div>
    </DashboardShell>
  );
}
