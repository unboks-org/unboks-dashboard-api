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

import { Calendar, MapPin, MessageCircle, ArrowLeft, Check, Loader2, Phone, Package, ReceiptText } from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { useBookingsLabel } from "@/hooks/use-bookings-label";
import { useAppointments } from "@/hooks/use-appointments";
import { useOrders } from "@/hooks/use-orders";
import { useActiveConversationKeys } from "@/hooks/use-active-conversation-keys";
import { useConversation } from "@/hooks/use-client-api";
import { filterActiveAppointments } from "@/lib/appointment-classifier";
import { sanitizeMessageContent } from "@/lib/message-sanitize";
import { useMemo, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
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
  archiveConversation,
  confirmAppointment,
  markOrderPhoneConfirmed,
  resolveEscalation,
  type Appointment,
  type AppointmentStatus,
} from "@/lib/api";
import { ApiError } from "@/lib/error";

function avatarColor(name: string) {
  // Muted, desaturated palette — matches Inbox avatar treatment.
  const colors = ["#7a8fa6", "#8b7ba8", "#6b9a78", "#a0786a", "#6885a3", "#9a6e8a", "#5f8fa0"];
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
      return "Facebook";
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

function orderStatusPill(apt: Appointment) {
  if (!apt.orderStatus) return null;
  if (apt.orderStatus === "awaiting_human_confirmation") {
    return {
      label: "Needs phone confirmation",
      className: "bg-[#fef7e0] text-[#5f3e00] border border-[#feefc3]",
    };
  }
  if (apt.orderStatus === "awaiting_customer_confirmation") {
    return {
      label: "Awaiting customer confirmation",
      className: "bg-[#e8f0fe] text-[#174ea6] border border-[#d2e3fc]",
    };
  }
  if (apt.orderStatus === "confirmed") {
    return {
      label: "Phone confirmed",
      className: "bg-[#e6f4ea] text-[#137333] border border-[#ceead6]",
    };
  }
  return {
    label: "Order in progress",
    className: "bg-[#f1f3f4] text-[#3c4043] border border-[#e8eaed]",
  };
}

export default function Bookings() {
  const { label } = useBookingsLabel();
  const isOrdersView = /\border/i.test(label);
  const workspaceSingular = isOrdersView ? "order" : "appointment";
  const workspacePlural = isOrdersView ? "orders" : "appointments";
  const { appointments: rawAppointments, isLoading, backendAvailable } =
    useAppointments();
  const { orders: rawOrders, isLoading: ordersLoading, backendAvailable: ordersBackendAvailable } =
    useOrders();
  // Hide appointments whose owning conversation was archived or deleted
  // on this device. Same predicate the sidebar Appointments badge uses,
  // so the page and the badge can never disagree.
  const { keys: activeConversationKeys, ready: convKeysReady } =
    useActiveConversationKeys();
  const visibleItems = isOrdersView ? rawOrders : rawAppointments;
  const activeBackendAvailable = isOrdersView ? ordersBackendAvailable : backendAvailable;
  const activeIsLoading = isOrdersView ? ordersLoading : isLoading;
  const appointments = useMemo(
    () =>
      filterActiveAppointments(
        visibleItems,
        activeConversationKeys,
        convKeysReady,
      ),
    [visibleItems, activeConversationKeys, convKeysReady],
  );
  // R2-23 — clicking "View conversation" used to navigate to Inbox
  // (sidebar context loss), then briefly used a modal (awkward UX).
  // The final design is a clean inline swap on the right pane:
  // viewMode "detail" shows the appointment summary; viewMode
  // "conversation" shows a curated decision-context view of the
  // underlying conversation. Sidebar stays on Appointments the entire
  // time, and switching back to detail keeps the same appointment
  // selected, the list scroll position, and the deep-link highlight.
  // viewMode resets to "detail" whenever the operator picks a
  // different appointment so they never land on the previous
  // conversation view by accident.
  const [rightPaneView, setRightPaneView] = useState<"detail" | "conversation">("detail");
  const openConversation = () => setRightPaneView("conversation");
  const backToDetail = () => setRightPaneView("detail");

  // Confirm-appointment flow.
  // We only allow confirmation for backend rows. Detection-only rows
  // don't have a backend id, so calling /confirm would 404 — and even
  // a synthetic id would have no row to mark confirmed. The button
  // hides for such rows, matching acceptance criteria 1 + 8 in the
  // tracking issue.
  const queryClient = useQueryClient();
  const [pendingConfirm, setPendingConfirm] = useState<Appointment | null>(null);
  const [pendingPhoneConfirm, setPendingPhoneConfirm] = useState<Appointment | null>(null);
  const [pendingProcessOrder, setPendingProcessOrder] = useState<Appointment | null>(null);
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

  const phoneConfirmMutation = useMutation({
    mutationFn: async (appointment: Appointment) => {
      const escalationId = escalationIdFromOrderAppointment(appointment);
      if (!escalationId) throw new Error("Order id is missing.");
      await markOrderPhoneConfirmed(escalationId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["escalations"] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["status"] });
      toast.success("Phone confirmation saved");
      setPendingPhoneConfirm(null);
      setSelectedApt((current) =>
        current && isOrderItem(current)
          ? {
              ...current,
              orderStatus: "confirmed",
              nextOperatorAction: "Prepare, deliver, and mark this order fulfilled.",
            }
          : current,
      );
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Could not mark phone confirmation.";
      toast.error(msg);
    },
  });

  const processOrderMutation = useMutation({
    mutationFn: async (appointment: Appointment) => {
      const escalationId = escalationIdFromOrderAppointment(appointment);
      if (!escalationId) throw new Error("Order escalation id is missing.");
      if (appointment.orderStatus !== "confirmed") {
        throw new Error("Call the customer and mark phone confirmation before fulfilling this order.");
      }
      await resolveEscalation(escalationId, {
        resolutionNote: "Order fulfilled by operator.",
        saveAsLearning: false,
      });
      await archiveConversation(appointment.conversationId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["escalations"] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["conversations", "archived"] });
      void queryClient.invalidateQueries({ queryKey: ["status"] });
      toast.success("Order fulfilled and archived");
      setPendingProcessOrder(null);
      setSelectedApt(null);
      setRightPaneView("detail");
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Could not process this order.";
      toast.error(msg);
    },
  });

  const showPendingSyncHint = !activeBackendAvailable && appointments.length > 0;

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
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
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
      setSelectedApt(match);
      setRightPaneView("detail");
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
      pageSubtitle={
        isOrdersView
          ? "Customer orders waiting for phone confirmation or fulfillment."
          : "Scheduled customer appointments and confirmed follow-ups."
      }
    >
      <div className="flex h-full flex-col">
        {showPendingSyncHint && (
          <div className="border-b border-[#e8eaed] bg-[#fbfbfd] px-4 py-2 text-[12px] text-[#5f6368]">
            {isOrdersView
              ? "Showing local order signals from your conversations. They will sync once the order service is connected."
              : "Showing detected appointments from your conversations. They will sync once the appointments service is connected."}
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

        <div className="flex flex-1 overflow-hidden">
          {/* Appointment list — hidden on mobile when detail is open.
              On desktop the list is always a fixed 320px column so the
              empty-detail placeholder centers inside the actual detail
              pane (not 50% of the page); on mobile the list takes the
              full width when nothing is selected, since the empty
              placeholder is hidden below `md`. */}
          {/* List column width logic. When the column has rows to
              scroll we want the canonical 320px gutter on desktop so
              the detail pane has room. When the column is empty (no
              rows AND no selection — loading or zero appointments) we
              drop the fixed width and the right border so the placeholder
              centers across the entire workspace instead of inside a
              narrow gutter on the far left of a wide page. The
              right-pane "Select an appointment" placeholder is gated
              on `appointments.length > 0` further down, so dropping
              the border when empty doesn't leave a stranded divider. */}
          <div
            className={cn(
              "overflow-y-auto",
              selectedApt
                ? "hidden md:flex md:flex-col md:w-[320px] md:flex-none md:border-r md:border-[#f1f3f4]"
                : appointments.length === 0
                  ? "flex-1 flex flex-col"
                  : "flex-1 flex flex-col md:w-[320px] md:flex-none md:border-r md:border-[#f1f3f4]",
            )}
          >
            {activeIsLoading && appointments.length === 0 ? (
              // `flex-1` is required for the centering: without it the
              // wrapper collapses to its content height and the
              // `justify-center` is a no-op, leaving the message pinned
              // to the top. With `flex-1` the wrapper fills the
              // remaining column height and the message lands in the
              // visual middle of the list pane on every viewport.
              <div className="flex flex-1 flex-col items-center justify-center text-center px-6">
                <p className="text-[14px] text-[#5f6368]">Loading {workspacePlural}...</p>
              </div>
            ) : appointments.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center px-6">
                <Calendar className="w-8 h-8 text-[#9aa0a6] mb-3" />
                <p className="text-[14px] text-[#5f6368]">No {workspacePlural} yet.</p>
                <p className="text-[12px] text-[#9aa0a6] mt-1 max-w-[360px]">
                  {isOrdersView
                    ? "Orders will appear here when a customer confirms an order and your team needs to finalize it."
                    : "Appointments will appear here when a customer schedules a meeting and a date, time, and location are confirmed."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#f1f3f4]">
                {appointments.map((apt) => {
                  const pill = orderStatusPill(apt) ?? statusPill(apt.status, apt.source, activeBackendAvailable);
                  const isOrderRow = isOrderItem(apt);
                  const orderEscalationId = escalationIdFromOrderAppointment(apt);
                  const canConfirm = !isOrderRow && apt.source === "backend" && apt.status !== "confirmed";
                  const confirmingThis = confirmMutation.isPending && pendingConfirm?.id === apt.id;
                  const needsPhoneConfirmation =
                    isOrderRow &&
                    Boolean(orderEscalationId) &&
                    apt.orderStatus === "awaiting_human_confirmation";
                  const phoneConfirmingThis =
                    phoneConfirmMutation.isPending && pendingPhoneConfirm?.id === apt.id;
                  const isSelected = selectedApt?.id === apt.id;
                  return (
                    <li
                      key={apt.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(apt.id, el);
                        else rowRefs.current.delete(apt.id);
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSelectedApt(apt); setRightPaneView("detail"); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedApt(apt);
                          setRightPaneView("detail");
                        }
                      }}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 bg-card transition-all duration-200 ease-out cursor-pointer active:scale-[0.98] active:opacity-80 border-b border-border",
                        isSelected
                          ? "bg-primary/10 shadow-sm rounded-xl mx-2 my-1 border-transparent"
                          : highlightedId === apt.id
                            ? "bg-primary/10 ring-1 ring-inset ring-primary/30 rounded-xl mx-2 my-1 border-transparent"
                            : "hover:bg-muted"
                      )}
                    >
                      {/* Avatar */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-medium flex-shrink-0 shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.18)]"
                        style={{ backgroundColor: avatarColor(apt.customerName) }}
                        aria-hidden="true"
                      >
                        {initial(apt.customerName)}
                      </div>
                      {/* Customer + topic + status */}
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium text-[#202124] truncate">
                          {apt.customerName}
                        </p>
                        <p className="text-[12px] text-[#5f6368] truncate">{apt.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span
                            className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                              pill.className,
                            )}
                          >
                            {pill.label}
                          </span>
                          <span className="text-[11px] text-[#9aa0a6] truncate">{apt.dateTimeLabel}</span>
                        </div>
                      </div>
                      {/* Confirm button on row — stopPropagation so click does not open detail */}
                      {canConfirm && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPendingConfirm(apt); }}
                          disabled={confirmingThis}
                          className={cn(
                            "flex-shrink-0 inline-flex items-center gap-1 rounded-md border border-[#1a73e8] bg-[#1a73e8] px-2.5 py-1 text-[12px] font-medium text-white transition-colors",
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
                          Confirm
                        </button>
                      )}
                      {needsPhoneConfirmation && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPendingPhoneConfirm(apt); }}
                          disabled={phoneConfirmingThis}
                          className={cn(
                            "flex-shrink-0 inline-flex items-center gap-1 rounded-md border border-[#1a73e8] bg-[#1a73e8] px-2.5 py-1 text-[12px] font-medium text-white transition-colors",
                            "hover:bg-[#1664c1] hover:border-[#1664c1]",
                            "focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30",
                            "disabled:opacity-60 disabled:cursor-not-allowed",
                          )}
                          title="Mark that you called the customer and confirmed the order details."
                        >
                          {phoneConfirmingThis ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Phone className="w-3.5 h-3.5" />
                          )}
                          Call done
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Appointment detail pane */}
          {selectedApt && rightPaneView === "detail" ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              {/* Pane header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#f1f3f4] bg-white flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedApt(null)}
                  className="md:hidden w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#f1f3f4] text-[#5f6368] flex-shrink-0"
                  aria-label="Back to appointments"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <p className="text-[13px] font-medium text-[#202124] truncate">
                  {isOrderItem(selectedApt) ? "Order" : "Appointment"}
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedApt(null)}
                  className="hidden md:flex ml-auto w-7 h-7 items-center justify-center rounded-full hover:bg-[#f1f3f4] text-[#5f6368] flex-shrink-0"
                  aria-label="Close"
                >
                  <span className="text-[16px] leading-none">&times;</span>
                </button>
              </div>

              {/* Detail body */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-4">
                  {/* Customer hero */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[18px] font-semibold flex-shrink-0 shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.18)]"
                      style={{ backgroundColor: avatarColor(selectedApt.customerName) }}
                      aria-hidden="true"
                    >
                      {initial(selectedApt.customerName)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[16px] font-semibold text-[#202124] truncate">
                        {selectedApt.customerName}
                      </p>
                      <p className="text-[12px] text-[#5f6368]">
                        {channelLabel(selectedApt.channel)}
                      </p>
                    </div>
                  </div>

                  {/* Status pill */}
                  {(() => {
                    const pill = orderStatusPill(selectedApt) ?? statusPill(selectedApt.status, selectedApt.source, activeBackendAvailable);
                    return (
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-[#5f6368]">Status</span>
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", pill.className)}>
                          {pill.label}
                        </span>
                      </div>
                    );
                  })()}

                  {isOrderItem(selectedApt) &&
                    escalationIdFromOrderAppointment(selectedApt) &&
                    selectedApt.orderStatus === "awaiting_human_confirmation" && (
                      <div className="rounded-xl border border-[#feefc3] bg-[#fef7e0] p-3 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-[#5f3e00]">
                              Phone call needed
                            </p>
                            <p className="mt-0.5 text-[12px] text-[#7d5700]">
                              Call the customer, confirm the order, address, and delivery details, then save it here.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPendingPhoneConfirm(selectedApt)}
                            disabled={phoneConfirmMutation.isPending && pendingPhoneConfirm?.id === selectedApt.id}
                            className={cn(
                              "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#1a73e8] bg-[#1a73e8] px-4 text-[13px] font-medium text-white transition-colors md:min-h-0 md:h-9 md:flex-shrink-0",
                              "hover:bg-[#1664c1] hover:border-[#1664c1]",
                              "focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30",
                              "disabled:opacity-60 disabled:cursor-not-allowed",
                            )}
                          >
                            {phoneConfirmMutation.isPending && pendingPhoneConfirm?.id === selectedApt.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Phone className="w-4 h-4" />
                            )}
                            Mark phone call confirmed
                          </button>
                        </div>
                      </div>
                    )}

                  {isOrderItem(selectedApt) &&
                    escalationIdFromOrderAppointment(selectedApt) &&
                    selectedApt.orderStatus === "confirmed" && (
                      <div className="rounded-xl border border-[#d6eadb] bg-[#f1f8f3] p-3 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-[#137333]">Phone confirmed</p>
                            <p className="mt-0.5 text-[12px] text-[#3c6f47]">
                              Prepare and deliver the order, then mark it fulfilled to archive it.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPendingProcessOrder(selectedApt)}
                            disabled={processOrderMutation.isPending && pendingProcessOrder?.id === selectedApt.id}
                            className={cn(
                              "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#188038] bg-[#188038] px-4 text-[13px] font-medium text-white transition-colors md:min-h-0 md:h-9 md:flex-shrink-0",
                              "hover:bg-[#137333] hover:border-[#137333]",
                              "focus:outline-none focus:ring-2 focus:ring-[#188038]/30",
                              "disabled:opacity-60 disabled:cursor-not-allowed",
                            )}
                          >
                            {processOrderMutation.isPending && pendingProcessOrder?.id === selectedApt.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                            Mark order fulfilled
                          </button>
                        </div>
                      </div>
                    )}

                  {/* Appointment/order info card */}
                  {isOrderItem(selectedApt) ? (
                    <OrderDetailCard appointment={selectedApt} />
                  ) : (
                    <div className="rounded-lg border border-[#e6e8eb] bg-[#fbfbfd] p-3 space-y-2">
                      <p className="text-[14px] font-medium text-[#1f2937]">{selectedApt.title}</p>
                      <div className="flex items-center gap-2 text-[13px] text-[#202124]">
                        <Calendar className="w-4 h-4 text-[#5f6368] flex-shrink-0" />
                        <span>{selectedApt.dateTimeLabel}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[13px] text-[#5f6368]">
                        <MapPin className="w-4 h-4 flex-shrink-0" />
                        <span>{selectedApt.location ?? "Location not set"}</span>
                      </div>
                    </div>
                  )}

                  {/* Confirm action — shown when pending and backend-sourced */}
                  {selectedApt.source === "backend" && selectedApt.status !== "confirmed" && (
                    <div className="rounded-lg border border-[#feefc3] bg-[#fef7e0] p-3">
                      <p className="text-[13px] font-medium text-[#5f3e00]">Pending confirmation</p>
                      <p className="text-[12px] text-[#7d5700] mt-0.5">
                        Confirm this appointment to notify the customer and alert destinations.
                      </p>
                      <button
                        type="button"
                        onClick={() => setPendingConfirm(selectedApt)}
                        disabled={confirmMutation.isPending && pendingConfirm?.id === selectedApt.id}
                        className={cn(
                          "mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#1a73e8] bg-[#1a73e8] px-3 py-2 text-[13px] font-medium text-white transition-colors",
                          "hover:bg-[#1664c1] hover:border-[#1664c1]",
                          "focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30",
                          "disabled:opacity-60 disabled:cursor-not-allowed",
                        )}
                      >
                        {confirmMutation.isPending && pendingConfirm?.id === selectedApt.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        Confirm appointment
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={openConversation}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#e6e8eb] bg-white px-3 py-2 text-[13px] text-[#1a73e8] font-medium hover:bg-[#f0f6ff] transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    View conversation
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Inline conversation-context pane (R2-23 final UX).
              Replaces the appointment detail body when the operator
              taps "View conversation". Sidebar stays on Appointments;
              the back arrow returns to the appointment detail with
              all selection state intact. */}
          {selectedApt && rightPaneView === "conversation" && (
            <ConversationContextPane
              appointment={selectedApt}
              onBack={backToDetail}
            />
          )}

          {/* Right-pane "select an appointment" placeholder. Only shown
              on desktop AND only when there are appointments to select —
              otherwise the left column already explains the empty state
              and showing two side-by-side empty messages on desktop
              looked broken. The wrapper is the flex child here, so
              `flex-1 items-center justify-center` actually centers
              (the parent of this block is `flex flex-1 overflow-hidden`
              which gives this child its full height). */}
          {!selectedApt && appointments.length > 0 && (
            <div className="hidden md:flex flex-1 items-center justify-center text-center px-6">
              <div>
                <Calendar className="w-8 h-8 text-[#9aa0a6] mx-auto mb-2" />
                <p className="text-[13px] text-[#5f6368]">
                  Select an {workspaceSingular} to view details
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm-appointment guard dialog. The backend confirm endpoint
          fans out alerts (email / alt email / WhatsApp / Telegram /
          Messenger), so we never confirm without an explicit operator tap. */}
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
              <p className="font-medium text-[#1f2937]">{pendingConfirm.customerName}</p>
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
                "inline-flex items-center justify-center min-h-[44px] md:min-h-0 md:h-9 rounded-lg border border-[#e2e6ec] bg-white px-3 text-[13px] font-medium text-[#1f2937] transition-colors",
                "hover:border-[#1a73e8] hover:text-[#1a73e8]",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { if (pendingConfirm) confirmMutation.mutate(pendingConfirm.id); }}
              disabled={confirmMutation.isPending}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 min-h-[44px] md:min-h-0 md:h-9 rounded-lg border border-[#1a73e8] bg-[#1a73e8] px-3 text-[13px] font-medium text-white transition-colors",
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

      <Dialog
        open={pendingPhoneConfirm !== null}
        onOpenChange={(v) => {
          if (!v && !phoneConfirmMutation.isPending) setPendingPhoneConfirm(null);
        }}
      >
        <DialogContent className="box-border w-[calc(100vw-32px)] max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Mark phone call confirmed?</DialogTitle>
            <DialogDescription className="text-[#5f6368]">
              Use this after the customer has been called and the order, address, and delivery details are confirmed.
            </DialogDescription>
          </DialogHeader>
          {pendingPhoneConfirm && (
            <div className="rounded-md border border-[#e6e8eb] bg-[#fbfbfd] px-3 py-2 text-[13px]">
              <p className="font-medium text-[#1f2937]">{pendingPhoneConfirm.customerName}</p>
              <p className="text-[#5f6368] mt-0.5">{pendingPhoneConfirm.title}</p>
              {pendingPhoneConfirm.order?.address && (
                <p className="text-[#5f6368] mt-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {pendingPhoneConfirm.order.address}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setPendingPhoneConfirm(null)}
              disabled={phoneConfirmMutation.isPending}
              className={cn(
                "inline-flex items-center justify-center min-h-[44px] md:min-h-0 md:h-9 rounded-lg border border-[#e2e6ec] bg-white px-3 text-[13px] font-medium text-[#1f2937] transition-colors",
                "hover:border-[#1a73e8] hover:text-[#1a73e8]",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (pendingPhoneConfirm) phoneConfirmMutation.mutate(pendingPhoneConfirm);
              }}
              disabled={phoneConfirmMutation.isPending}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 min-h-[44px] md:min-h-0 md:h-9 rounded-lg border border-[#1a73e8] bg-[#1a73e8] px-3 text-[13px] font-medium text-white transition-colors",
                "hover:bg-[#1664c1] hover:border-[#1664c1]",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            >
              {phoneConfirmMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Phone className="w-3.5 h-3.5" />
              )}
              Confirm phone call
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingProcessOrder !== null}
        onOpenChange={(v) => {
          if (!v && !processOrderMutation.isPending) setPendingProcessOrder(null);
        }}
      >
        <DialogContent className="box-border w-[calc(100vw-32px)] max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Mark order fulfilled?</DialogTitle>
            <DialogDescription className="text-[#5f6368]">
              This removes the order from active Orders, resolves the order work item, and archives the conversation.
            </DialogDescription>
          </DialogHeader>
          {pendingProcessOrder && (
            <div className="rounded-md border border-[#e6e8eb] bg-[#fbfbfd] px-3 py-2 text-[13px]">
              <p className="font-medium text-[#1f2937]">{pendingProcessOrder.customerName}</p>
              <p className="text-[#5f6368] mt-0.5">{pendingProcessOrder.title}</p>
              {pendingProcessOrder.order?.address && (
                <p className="text-[#5f6368] mt-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {pendingProcessOrder.order.address}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setPendingProcessOrder(null)}
              disabled={processOrderMutation.isPending}
              className={cn(
                "inline-flex items-center justify-center min-h-[44px] md:min-h-0 md:h-9 rounded-lg border border-[#e2e6ec] bg-white px-3 text-[13px] font-medium text-[#1f2937] transition-colors",
                "hover:border-[#188038] hover:text-[#188038]",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (pendingProcessOrder) processOrderMutation.mutate(pendingProcessOrder);
              }}
              disabled={processOrderMutation.isPending}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 min-h-[44px] md:min-h-0 md:h-9 rounded-lg border border-[#188038] bg-[#188038] px-3 text-[13px] font-medium text-white transition-colors",
                "hover:bg-[#137333] hover:border-[#137333]",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            >
              {processOrderMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Yes, order fulfilled
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardShell>
  );
}

function isOrderItem(appointment: Appointment): boolean {
  return Boolean(
    appointment.order ||
    appointment.orderStatus ||
    appointment.source === "order_escalation" ||
    appointment.source === "order_state",
  );
}

function escalationIdFromOrderAppointment(appointment: Appointment): string | null {
  if (appointment.escalationId) return appointment.escalationId;
  const prefix = "order-escalation:";
  return appointment.id.startsWith(prefix) ? appointment.id.slice(prefix.length) : null;
}

function OrderDetailCard({ appointment }: { appointment: Appointment }) {
  const order = appointment.order;
  const lines = order?.products ?? [];
  const phone = displayOrderPhone(order?.phone);
  const total =
    order?.total != null
      ? `${order.currency ? `${order.currency} ` : ""}${formatMoney(order.total)}`
      : "Price not captured";

  return (
    <div className="rounded-lg border border-[#dfe4ea] bg-white overflow-hidden">
      <div className="border-b border-[#eef0f3] bg-[#fbfcfe] px-3 py-2.5">
        <p className="text-[11px] uppercase tracking-wide text-[#5f6368] font-semibold">
          Order summary
        </p>
        <p className="mt-0.5 text-[15px] font-semibold text-[#1f2937]">
          {order?.customerName || appointment.customerName}
        </p>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <OrderField label="Name" value={order?.customerName || appointment.customerName} />
          <OrderField
            label="Phone"
            value={phone || "Phone not captured"}
            icon={<Phone className="w-3.5 h-3.5" />}
          />
          <OrderField
            label="Address"
            value={order?.address || "Address not captured"}
            icon={<MapPin className="w-3.5 h-3.5" />}
            wide
          />
        </div>

        <div className="rounded-md border border-[#eef0f3] bg-[#fbfbfd]">
          <div className="flex items-center gap-1.5 border-b border-[#eef0f3] px-3 py-2">
            <Package className="w-4 h-4 text-[#5f6368]" />
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#5f6368]">
              Order
            </p>
          </div>
          {lines.length > 0 ? (
            <ul className="divide-y divide-[#eef0f3]">
              {lines.map((line, idx) => (
                <li key={`${line.name}-${idx}`} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-[#1f2937] break-words">
                      {line.quantity != null ? `${line.quantity} x ` : ""}
                      {line.name}
                    </p>
                    {line.unitPrice != null && (
                      <p className="text-[12px] text-[#5f6368]">
                        Unit price: {order?.currency ? `${order.currency} ` : ""}{formatMoney(line.unitPrice)}
                      </p>
                    )}
                  </div>
                  {line.subtotal != null && (
                    <p className="text-[13px] font-medium text-[#1f2937] whitespace-nowrap">
                      {order?.currency ? `${order.currency} ` : ""}{formatMoney(line.subtotal)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-[13px] text-[#5f6368]">Order details not captured.</p>
          )}
        </div>

        <div className="flex items-center justify-between rounded-md border border-[#d6eadb] bg-[#f1f8f3] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-[#188038]" />
            <span className="text-[13px] font-medium text-[#1f2937]">Price</span>
          </div>
          <span className="text-[15px] font-semibold text-[#188038]">{total}</span>
        </div>

        {order?.comments && (
          <div className="rounded-md border border-[#eef0f3] bg-white px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-[#5f6368] font-semibold">
              Comments
            </p>
            <p className="mt-1 text-[13px] text-[#1f2937] whitespace-pre-wrap">
              {order.comments}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function displayOrderPhone(phone?: string | null): string {
  const raw = (phone ?? "").trim();
  if (!raw) return "";
  const digitCount = raw.replace(/\D/g, "").length;
  if (/^[a-f0-9]{20,32}$/i.test(raw) && digitCount < 10) return "";
  if (digitCount < 7) return "";
  return raw;
}

function OrderField({
  label,
  value,
  icon,
  wide = false,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("rounded-md border border-[#eef0f3] bg-[#fbfbfd] px-3 py-2", wide && "sm:col-span-2")}>
      <p className="text-[11px] uppercase tracking-wide text-[#5f6368] font-semibold">
        {label}
      </p>
      <p className="mt-1 flex items-start gap-1.5 text-[13px] font-medium text-[#1f2937] break-words">
        {icon ? <span className="mt-0.5 text-[#5f6368] flex-shrink-0">{icon}</span> : null}
        <span>{value}</span>
      </p>
    </div>
  );
}

function formatMoney(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Inline conversation-context pane (right side of the Appointments
 * page). Replaces the appointment-detail body when the operator clicks
 * "View conversation" on a selected appointment. The sidebar stays on
 * Appointments the whole time and the back arrow returns to the
 * appointment detail with all selection state preserved.
 *
 * Why curated, not a raw email dump
 * =================================
 * Calvin / Jr2 explicitly rejected showing the full message stream as
 * the Appointments-side conversation view. Operators here are deciding
 * "is this booking real, who proposed what slot, who confirmed it".
 * Email noise (signatures, quoted reply history, mobile-client
 * footers, confidentiality disclaimers) buries that signal and makes
 * the page feel like an inbox forensic tool.
 *
 * So this pane:
 *   1. Surfaces the booked slot at the top (date/time/location/topic)
 *      as the headline answer.
 *   2. Below, renders a curated message trail. Each message body is
 *      passed through `sanitizeMessageContent` to strip the noise
 *      listed above.
 *   3. Bubbles whose sanitised body is empty (pure noise) are dropped.
 *   4. Bubbles are laid out as a clean two-column thread, oldest at
 *      the top, with auto-scroll to the newest message on open and as
 *      the heartbeat appends new replies.
 *
 * No reply composer, no escalation controls, no AI editor — operators
 * who need to reply have one click to Inbox via the footer hint.
 */
function ConversationContextPane({
  appointment,
  onBack,
}: {
  appointment: Appointment;
  onBack: () => void;
}) {
  const { data: detail, isLoading, isError } = useConversation(
    appointment.conversationId,
  );

  // Build the curated trail: oldest first, sanitised, drop empties.
  const trail = useMemo(() => {
    const msgs = detail?.messages ?? [];
    const sorted = [...msgs].sort(
      (a, b) => (a.timestampMs || 0) - (b.timestampMs || 0),
    );
    return sorted
      .map((m) => ({ ...m, cleaned: sanitizeMessageContent(m.content) }))
      .filter((m) => m.cleaned.length > 0);
  }, [detail?.messages]);

  // Auto-scroll the trail to the newest message on open and as the
  // 10s conversation heartbeat appends new replies. requestAnimationFrame
  // defers until bubbles have measured so scrollHeight is final.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [appointment.conversationId, trail.length]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Pane header — back arrow returns to the appointment detail
          for the same selectedApt; sidebar stays on Appointments. */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#f1f3f4] bg-white flex-shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="w-11 h-11 -ml-1 flex items-center justify-center rounded-full hover:bg-[#f1f3f4] text-[#5f6368] flex-shrink-0"
          aria-label="Back to appointment"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[#202124] truncate">
            Conversation context
          </p>
          <p className="text-[11.5px] text-[#5f6368] truncate">
            {appointment.customerName} . {channelLabel(appointment.channel)}
          </p>
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#fbfbfd]">
        <div className="p-4 space-y-4">
          {/* Decision context card — the booked slot, surfaced. This
              is the answer the operator came to confirm. */}
          <div className="rounded-lg border border-[#e6e8eb] bg-white p-3 space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-[#5f6368] font-medium">
              Booked slot
            </p>
            <p className="text-[14px] font-medium text-[#1f2937]">
              {appointment.title}
            </p>
            <div className="flex items-center gap-2 text-[13px] text-[#202124]">
              <Calendar className="w-4 h-4 text-[#5f6368] flex-shrink-0" />
              <span>{appointment.dateTimeLabel}</span>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[#5f6368]">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span>{appointment.location ?? "Location not set"}</span>
            </div>
          </div>

          {/* Curated trail */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[#5f6368] font-medium mb-2">
              Scheduling exchange
            </p>
            {isLoading && (
              <div className="flex items-center justify-center py-8 text-[13px] text-[#5f6368]">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading conversation
              </div>
            )}
            {isError && !isLoading && (
              <div className="rounded-md border border-[#feefc3] bg-[#fef7e0] px-3 py-2 text-[13px] text-[#5f3e00]">
                Could not load this conversation. Try again in a moment.
              </div>
            )}
            {!isLoading && !isError && trail.length === 0 && (
              <div className="rounded-md border border-[#e6e8eb] bg-white px-3 py-3 text-[13px] text-[#5f6368]">
                No conversation content to show. The underlying messages
                were either signatures, quoted replies, or disclaimers.
              </div>
            )}
            {!isLoading && !isError && trail.length > 0 && (
              <ul className="space-y-2">
                {trail.map((m, idx) => {
                  const isCustomer = m.role === "user";
                  const speaker =
                    m.role === "operator"
                      ? "You"
                      : m.role === "assistant"
                        ? "Agent"
                        : detail?.name ?? "Customer";
                  return (
                    <li
                      key={`${m.timestampMs}-${idx}`}
                      className={cn(
                        "flex",
                        isCustomer ? "justify-start" : "justify-end",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                          isCustomer
                            ? "bg-white border border-[#e6e8eb] text-[#1f2937] rounded-bl-sm"
                            : "bg-[#1a73e8] text-white rounded-br-sm",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {m.cleaned}
                        </p>
                        <p
                          className={cn(
                            "text-[11px] mt-1",
                            isCustomer ? "text-[#5f6368]" : "text-white/75",
                          )}
                        >
                          {speaker}
                          {m.timestamp ? ` . ${m.timestamp}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Footer hint — operators who need to reply go to Inbox. */}
      <div className="border-t border-[#e6e8eb] bg-white px-4 py-2 text-[12px] text-[#5f6368] flex-shrink-0">
        Read only view. To reply, open this conversation in Inbox.
      </div>
    </div>
  );
}
