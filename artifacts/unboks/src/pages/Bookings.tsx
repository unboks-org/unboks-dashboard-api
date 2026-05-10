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
import { Calendar, MapPin, MessageCircle, ArrowRight, Check, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { useBookingsLabel } from "@/hooks/use-bookings-label";
import { useAppointments } from "@/hooks/use-appointments";
import { useActiveConversationKeys } from "@/hooks/use-active-conversation-keys";
import { filterActiveAppointments } from "@/lib/appointment-classifier";
import { useMemo, useState, useEffect, useRef } from "react";
import { useDeepLink, clearDeepLinkQuery } from "@/lib/deep-link";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  confirmAppointment,
  type Appointment,
  type AppointmentStatus,
} from "@/lib/api";
import { ApiError } from "@/lib/error";

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
  const { appointments: rawAppointments, isLoading, backendAvailable } =
    useAppointments();
  // Hide appointments whose owning conversation was archived or deleted
  // on this device. Same predicate the sidebar Appointments badge uses,
  // so the page and the badge can never disagree.
  const { keys: activeConversationKeys, ready: convKeysReady } =
    useActiveConversationKeys();
  const appointments = useMemo(
    () =>
      filterActiveAppointments(
        rawAppointments,
        activeConversationKeys,
        convKeysReady,
      ),
    [rawAppointments, activeConversationKeys, convKeysReady],
  );
  const [, navigate] = useLocation();

  const openConversation = (conversationId: string) => {
    // Inbox reads `?c=<phone>` to auto-open a conversation. The phone
    // value can contain `+` and `:` so encode it.
    navigate(`/?c=${encodeURIComponent(conversationId)}`);
  };

  // Confirm-appointment flow.
  // We only allow confirmation for backend rows. Detection-only rows
  // don't have a backend id, so calling /confirm would 404 — and even
  // a synthetic id would have no row to mark confirmed. The button
  // hides for such rows, matching acceptance criteria 1 + 8 in the
  // tracking issue.
  const queryClient = useQueryClient();
  const [pendingConfirm, setPendingConfirm] = useState<Appointment | null>(null);
  const confirmMutation = useMutation({
    mutationFn: (appointmentId: string) =>
      confirmAppointment(appointmentId, { confirmedBy: "operator" }),
    onSuccess: (data) => {
      // Refresh /appointments either way so a duplicate confirm still
      // pulls the canonical confirmedAt + status into the cache.
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      if (data.alreadyConfirmed) {
        toast.message("Appointment was already confirmed");
      } else {
        toast.success("Appointment confirmed");
      }
      setPendingConfirm(null);
    },
    onError: (err) => {
      // 404 means the row no longer exists on the backend (already
      // removed or stale local state). Refresh the list so the bad row
      // disappears, and tell the operator clearly.
      if (err instanceof ApiError && err.status === 404) {
        void queryClient.invalidateQueries({ queryKey: ["appointments"] });
        toast.error("This appointment is no longer available. Refreshing.");
        setPendingConfirm(null);
        return;
      }
      const msg = err instanceof Error ? err.message : "Could not confirm appointment.";
      toast.error(msg);
    },
  });

  const showPendingSyncHint = !backendAvailable && appointments.length > 0;

  // ---- Deep-link handling (appointment links from alert emails / WhatsApp)
  //
  // Two link shapes resolve to this page:
  //   - Path:  /appointments/:id           (PRIMARY — what backend sends now)
  //   - Query: /appointments?appointmentId=ID  (fallback)
  //
  // We highlight the matching row and scroll it into view; we do NOT
  // auto-open the confirm dialog (acceptance criterion: "highlight /
  // open the matching appointment", not "act on it"). If the id isn't
  // in the loaded list, we surface a calm not-found banner.
  const deepLink = useDeepLink();
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [deepLinkNotFound, setDeepLinkNotFound] = useState<string | null>(null);
  const consumedDeepLinkRef = useRef<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  // Loaded means: the appointments query has settled at least once.
  // We rely on `isLoading` flipping to false plus appointments being
  // an array (it always is here) — once that happens we can declare
  // not-found honestly.
  useEffect(() => {
    if (deepLink.kind !== "appointment" || !deepLink.id) return;
    if (consumedDeepLinkRef.current === deepLink.id) return;
    if (isLoading) return;

    const id = deepLink.id;
    const match = appointments.find((a) => a.id === id) ?? null;
    if (match) {
      consumedDeepLinkRef.current = id;
      setHighlightedId(id);
      setDeepLinkNotFound(null);
      // Defer the scroll until after the row has rendered with the
      // highlight class. requestAnimationFrame handles both the
      // initial mount case and the case where the appointments
      // refetch populates the list.
      requestAnimationFrame(() => {
        const el = rowRefs.current.get(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      if (deepLink.source === "query") clearDeepLinkQuery();
    } else {
      consumedDeepLinkRef.current = id;
      setDeepLinkNotFound("Appointment not found or no longer active.");
      if (deepLink.source === "query") clearDeepLinkQuery();
    }
  }, [deepLink.kind, deepLink.id, deepLink.source, appointments, isLoading]);

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
        {deepLinkNotFound && (
          <div className="flex items-start justify-between gap-3 border-b border-[#feefc3] bg-[#fef7e0] px-4 py-2.5 text-[13px] text-[#5f3e00]">
            <span>{deepLinkNotFound}</span>
            <button
              type="button"
              onClick={() => setDeepLinkNotFound(null)}
              className="text-[12px] font-medium text-[#5f3e00] hover:text-[#1f2937] focus:outline-none"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
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
                // Confirm button visibility:
                //  - only for backend-sourced rows (detection rows have
                //    no canonical id to confirm against),
                //  - only when not already confirmed.
                const canConfirm =
                  apt.source === "backend" && apt.status !== "confirmed";
                const confirmingThis =
                  confirmMutation.isPending && pendingConfirm?.id === apt.id;
                const isHighlighted = highlightedId === apt.id;
                return (
                  <li
                    key={apt.id}
                    ref={(el) => {
                      // Track row nodes so the deep-link effect can scroll
                      // the matching row into view. Cleanup on unmount
                      // keeps the map from holding stale refs across
                      // list refetches.
                      if (el) rowRefs.current.set(apt.id, el);
                      else rowRefs.current.delete(apt.id);
                    }}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 transition-colors",
                      isHighlighted
                        ? "bg-[#e8f0fe] ring-1 ring-[#1a73e8]/30"
                        : "hover:bg-[#fbfbfd]",
                    )}
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
                      {canConfirm && (
                        <button
                          type="button"
                          onClick={() => setPendingConfirm(apt)}
                          disabled={confirmingThis}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border border-[#1a73e8] bg-[#1a73e8] px-2.5 py-1 text-[12px] font-medium text-white transition-colors",
                            "hover:bg-[#1664c1] hover:border-[#1664c1]",
                            "focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30",
                            "disabled:opacity-60 disabled:cursor-not-allowed",
                          )}
                          title="Confirm this appointment and notify configured alert destinations."
                        >
                          {confirmingThis ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">Confirm appointment</span>
                          <span className="sm:hidden">Confirm</span>
                        </button>
                      )}
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

      {/* Confirm-appointment guard dialog. The backend confirm endpoint
          fans out alerts (email / alt email / WhatsApp / Telegram /
          Messenger), so we never confirm without an explicit operator
          tap. */}
      <Dialog
        open={pendingConfirm !== null}
        onOpenChange={(v) => {
          if (!v && !confirmMutation.isPending) setPendingConfirm(null);
        }}
      >
        <DialogContent className="box-border w-[calc(100vw-32px)] max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Confirm this appointment?</DialogTitle>
            <DialogDescription className="text-[#5f6368]">
              This will notify the configured alert destinations.
            </DialogDescription>
          </DialogHeader>
          {pendingConfirm && (
            <div className="rounded-md border border-[#e6e8eb] bg-[#fbfbfd] px-3 py-2 text-[13px]">
              <p className="font-medium text-[#1f2937]">
                {pendingConfirm.customerName}
              </p>
              <p className="text-[#5f6368] mt-0.5">{pendingConfirm.title}</p>
              <p className="text-[#202124] mt-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#5f6368]" />
                {pendingConfirm.dateTimeLabel}
              </p>
              {pendingConfirm.location && (
                <p className="text-[#5f6368] mt-0.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {pendingConfirm.location}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setPendingConfirm(null)}
              disabled={confirmMutation.isPending}
              className={cn(
                "inline-flex items-center justify-center h-9 rounded-lg border border-[#e2e6ec] bg-white px-3 text-[13px] font-medium text-[#1f2937] transition-colors",
                "hover:border-[#1a73e8] hover:text-[#1a73e8]",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (pendingConfirm) confirmMutation.mutate(pendingConfirm.id);
              }}
              disabled={confirmMutation.isPending}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-[#1a73e8] bg-[#1a73e8] px-3 text-[13px] font-medium text-white transition-colors",
                "hover:bg-[#1664c1] hover:border-[#1664c1]",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            >
              {confirmMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Confirm appointment
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
