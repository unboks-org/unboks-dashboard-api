import { ApiError } from "@/lib/error";
import { getApiBase, getToken, clearAuth } from "@/lib/tenant";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiConversation {
  phone: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
  platform: string;
  hasAttachment?: boolean;
  escalated?: boolean;
}

export interface ApiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ConversationDetail {
  phone: string;
  name: string;
  platform: string;
  messages: ApiMessage[];
}

export interface Escalation {
  id: string;
  customerName: string;
  issue: string;
  platform: string;
  createdAt: string;
  resolved: boolean;
  phone?: string;
}

export interface AvailabilitySlot {
  date: string;
  capacity: number;
  booked: number;
  guests: string[];
}

export interface ScheduleSlot {
  day: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

export interface ConfigResponse {
  clientName: string;
  connectedPlatforms: string[];
  features: Record<string, boolean>;
}

export interface StatusResponse {
  status: "ok" | "degraded" | "down";
  activeConversations: number;
  openEscalations: number;
  uptime: string;
}

export interface LoginResponse {
  token: string;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

let _lastUnauthorizedAt: number | null = null;
let _onUnauthorized: (() => void) | null = null;

export function registerUnauthorizedHandler(fn: () => void) {
  _onUnauthorized = fn;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = getApiBase();
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${base}${path}`, { ...options, headers });

  if (res.status === 401) {
    const now = Date.now();
    const tooSoon = _lastUnauthorizedAt && now - _lastUnauthorizedAt < 60_000;
    _lastUnauthorizedAt = now;
    if (!tooSoon && _onUnauthorized) {
      clearAuth();
      _onUnauthorized();
    }
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.message ?? body.error ?? msg;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function apiLogin(password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

// ---------------------------------------------------------------------------
// Conversations (Inbox)
// ---------------------------------------------------------------------------

export async function fetchConversations(): Promise<ApiConversation[]> {
  return apiFetch<ApiConversation[]>("/messages/conversations");
}

export async function fetchConversation(phone: string): Promise<ConversationDetail> {
  return apiFetch<ConversationDetail>(`/messages/conversations/${encodeURIComponent(phone)}`);
}

export async function deleteConversation(phone: string): Promise<void> {
  return apiFetch<void>(`/messages/conversations/${encodeURIComponent(phone)}`, {
    method: "DELETE",
  });
}

export async function suggestReply(phone: string): Promise<{ suggestion: string }> {
  return apiFetch<{ suggestion: string }>("/messages/suggest-reply", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

// ---------------------------------------------------------------------------
// Escalations
// ---------------------------------------------------------------------------

export async function fetchEscalations(): Promise<Escalation[]> {
  return apiFetch<Escalation[]>("/escalations");
}

export async function resolveEscalation(id: string): Promise<void> {
  return apiFetch<void>(`/escalations/${id}/resolve`, { method: "POST" });
}

export async function replyEscalation(id: string, message: string): Promise<void> {
  return apiFetch<void>(`/escalations/${id}/reply`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function deleteEscalation(id: string): Promise<void> {
  return apiFetch<void>(`/escalations/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Availability (Bookings)
// ---------------------------------------------------------------------------

export async function fetchAvailability(days = 7): Promise<AvailabilitySlot[]> {
  return apiFetch<AvailabilitySlot[]>(`/availability?days=${days}`);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export async function fetchConfig(): Promise<ConfigResponse> {
  return apiFetch<ConfigResponse>("/config");
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export async function fetchScheduleSlots(): Promise<ScheduleSlot[]> {
  return apiFetch<ScheduleSlot[]>("/schedule/slots");
}

export async function saveScheduleSlots(slots: ScheduleSlot[]): Promise<void> {
  return apiFetch<void>("/schedule/slots", {
    method: "PUT",
    body: JSON.stringify(slots),
  });
}

// ---------------------------------------------------------------------------
// Status / Analytics
// ---------------------------------------------------------------------------

export async function fetchStatus(): Promise<StatusResponse> {
  return apiFetch<StatusResponse>("/status");
}

// ---------------------------------------------------------------------------
// Dry-run
// ---------------------------------------------------------------------------

export async function fetchDryRunStatus(): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>("/settings/dry-run");
}

export async function setDryRun(enabled: boolean): Promise<void> {
  return apiFetch<void>("/settings/dry-run", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}
