/**
 * Appointments page (mounted at /bookings and /appointments).
 *
 * The route filename stays `Bookings.tsx` to keep the wouter route key
 * stable for any deep links / bookmarks operators already have. The
 * page itself is the new Appointments view.
 *
 * Sourcing
 * ========
 * Rows come from `useAppointments`, which merges:
 *   - GET /appointments (when the backend endpoint is connected), and
 *   - frontend detection over the existing conversation list.
 *
 * Backend rows take precedence on dedup so a `confirmed` backend row
 * never gets shadowed by a `detected` row for the same conversation +
 * dateTimeLabel. When the only rows on screen come from detection, a
 * subtle "Pending sync" hint reminds the operator that the backend
 * hasn't stored these yet — we never pretend an appointment was saved.
 *
 * Layout
 * ======
 * Premium SaaS workspace list:
 *   left   — customer name + topic
 *   middle — date/time + location
 *   right  — status pill + Open conversation
 *
 * Strict copy rule: no em dashes anywhere in this file's user-facing
 * text. Em dash is freely allowed in code comments.
 */

import { useLocation } from "wouter";
import { Calendar, MapPin, MessageCircle, ArrowRight } from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { useBookingsLabel } from "@/hooks/use-bookings-label";
import { useAppointments } from "@/hooks/use-appointments";
import { cn } from "@/lib/utils";
import type { Appointment, AppointmentStatus } from "@/lib/api";

function avatarColor(name: string) {
  const colors = ["#f9a825", "#1a73e8", "#34a853", "#ea4335", "#7e57c2", "#ec407a", "#26a69a"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function channelLabel(slug: string): string {
  switch (slug.toLowerCase()) {
    case "whatsapp":
      return "WhatsApp";
    case "email":
      return "Email";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "messenger":
      return "Messenger";
    case "tiktok":
      return "TikTok";
    case "x":
    case "twitter":
      return "X";
    default:
      return slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "Unknown";
  }
}

function statusPill(
  status: AppointmentStatus,
  source: Appointment["source"],
  backendAvailable: boolean,
) {
  if (status === "confirmed") {
    return {
      label: "Confirmed",
      className: "bg-[#e6f4ea] text-[#137333] border border-[#ceead6]",
    };
  }
  if (status === "pending") {
    return {
      label: "Pending team confirmation",
      className: "bg-[#fef7e0] text-[#5f3e00] border border-[#feefc3]",
    };
  }
  // detected — only flag as "pending sync" when the row came from
  // detection AND the backend appointments endpoint isn't connected. If
  // the backend is connected and simply hasn't stored a row for this
  // detection yet, we still show plain "Detected" so we don't mislead.
  const showPendingSync = source === "conversation" && !backendAvailable;
  return {
    label: showPendingSync ? "Detected, pending sync" : "Detected",
    className: "bg-[#f1f3f4] text-[#3c4043] border border-[#e8eaed]",
  };
}

export default function Bookings() {
  const { label } = useBookingsLabel();
  const { appointments, isLoading, backendAvailable } = useAppointments();
  const [, navigate] = useLocation();

  const openConversation = (conversationId: string) => {
    // Inbox reads `?c=<phone>` to auto-open a conversation. The phone
    // value can contain `+` and `:` so encode it.
    navigate(`/?c=${encodeURIComponent(conversationId)}`);
  };

  const showPendingSyncHint = !backendAvailable && appointments.length > 0;

  return (
    <DashboardShell
      activeNav="bookings"
      pageTitle={label}
      pageSubtitle="Scheduled customer appointments and confirmed follow-ups."
    >
      <div className="flex h-full flex-col">
        {showPendingSyncHint && (
          <div className="border-b border-[#e8eaed] bg-[#fbfbfd] px-4 py-2 text-[12px] text-[#5f6368]">
            Showing detected appointments from your conversations. They will
            sync once the appointments service is connected.
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoading && appointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <p className="text-[14px] text-[#5f6368]">Loading appointments...</p>
            </div>
          ) : appointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <Calendar className="w-8 h-8 text-[#9aa0a6] mb-3" />
              <p className="text-[14px] text-[#5f6368]">No appointments yet.</p>
              <p className="text-[12px] text-[#9aa0a6] mt-1 max-w-[360px]">
                Appointments will appear here when a customer schedules a
                meeting and a date, time, and location are confirmed.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#f1f3f4]">
              {appointments.map((apt) => {
                const pill = statusPill(apt.status, apt.source, backendAvailable);
                return (
                  <li
                    key={apt.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#fbfbfd] transition-colors"
                  >
                    {/* Customer + topic */}
                    <div className="flex items-center gap-3 min-w-0 flex-[1.2]">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-medium flex-shrink-0"
                        style={{ backgroundColor: avatarColor(apt.customerName) }}
                        aria-hidden="true"
                      >
                        {initial(apt.customerName)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-[#202124] truncate">
                          {apt.customerName}
                        </p>
                        <p className="text-[12px] text-[#5f6368] truncate">
                          {apt.title}
                          <span className="text-[#9aa0a6]">
                            {" \u00B7 "}
                            {channelLabel(apt.channel)}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Date / time + location */}
                    <div className="hidden sm:flex flex-col min-w-0 flex-[1.1]">
                      <div className="flex items-center gap-1.5 text-[13px] text-[#202124]">
                        <Calendar className="w-3.5 h-3.5 text-[#5f6368] flex-shrink-0" />
                        <span className="truncate">{apt.dateTimeLabel}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[12px] text-[#5f6368] mt-0.5">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {apt.location ?? "Location not set"}
                        </span>
                      </div>
                    </div>

                    {/* Status + open. On mobile the date/time stack hides,
                        so duplicate the essentials into the trailing block
                        compactly. */}
                    <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                      <div className="sm:hidden flex flex-col items-end mr-1">
                        <span className="text-[12px] text-[#202124]">
                          {apt.dateTimeLabel}
                        </span>
                        {apt.location && (
                          <span className="text-[11px] text-[#5f6368] max-w-[140px] truncate">
                            {apt.location}
                          </span>
                        )}
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                          pill.className,
                        )}
                        title={
                          apt.source === "conversation"
                            ? "Detected from this conversation. Will sync when the appointments service is connected."
                            : "From the appointments service."
                        }
                      >
                        {pill.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => openConversation(apt.conversationId)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-[#1a73e8] hover:bg-[#f0f6ff] transition-colors"
                        title="Open the source conversation in the inbox."
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Open
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
