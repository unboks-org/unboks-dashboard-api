import { ApiError } from "@/lib/error";
import { getApiBase, getToken, clearAuth } from "@/lib/tenant";

// ---------------------------------------------------------------------------
// Valid clients
// ---------------------------------------------------------------------------

export const VALID_CLIENTS = [
  "unboks",
  "bluemarlin",
  "adamus",
  "consultadespertares",
] as const;

export type ValidClient = (typeof VALID_CLIENTS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscalationMode = "soft" | "hard" | null;
export type LearningStatus = "none" | "suggested" | "approved" | "saved";

export interface ApiConversation {
  phone: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
  platform: string;
  hasAttachment?: boolean;
  escalated?: boolean;
  escalationMode?: EscalationMode;
  escalationSummary?: string | null;
  learningStatus?: LearningStatus;
  // Alternative field names that different API shapes may return
  _id?: string;
  customerName?: string;
  senderName?: string;
  contactName?: string;
  profileName?: string;
  email?: string;
  from?: string;
  latestMessage?: string;
  last_message?: string;
  preview?: string;
  snippet?: string;
  body?: string;
  text?: string;
  messages?: Array<{
    id?: string;
    role?: string;
    content?: string;
    text?: string;
    body?: string;
    timestamp?: string;
  }>;
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
  contactId?: string | null;
  platform: string;
  messages: ApiMessage[];
  escalated?: boolean;
  escalationResolved?: boolean;
  escalationMode?: EscalationMode;
  escalationReason?: string | null;
  escalationSummary?: string | null;
  humanGuidance?: string | null;
  humanResponder?: string | null;
  humanRespondedAt?: string | null;
  learningStatus?: LearningStatus;
}

export interface Escalation {
  id: string;
  customerName: string;
  issue: string;
  platform: string;
  createdAt: string;
  resolved: boolean;
  phone?: string;
  mode?: EscalationMode;
  reason?: string | null;
  summary?: string | null;
  learningStatus?: LearningStatus;
}

export interface GuidancePayload {
  guidance: string;
  saveToYourInfo?: boolean;
  autoUseNextTime?: boolean;
  category?: string;
}

export interface ResolvePayload {
  resolutionNote?: string;
  saveAsLearning?: boolean;
  autoUseNextTime?: boolean;
  category?: string;
}

export interface LearningEntry {
  id: string;
  conversationId: string | null;
  sourceQuestion: string;
  aiUncertainty: string | null;
  humanAnswer: string;
  category: string | null;
  aiMayUseAutomatically: boolean;
  status: LearningStatus;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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
  clientName?: string;
  connectedPlatforms?: string[];
  features?: Record<string, boolean>;
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

let _first401At: number | null = null;
let _onUnauthorized: (() => void) | null = null;

export function registerUnauthorizedHandler(fn: () => void) {
  _onUnauthorized = fn;
}

function handle401() {
  const token = getToken();
  const now = Date.now();

  if (!token) {
    // No token at all — clear immediately
    clearAuth();
    _onUnauthorized?.();
    return;
  }

  if (_first401At === null) {
    // First 401 with a token — record but tolerate (might be a stale request)
    _first401At = now;
    return;
  }

  if (now - _first401At < 60_000) {
    // Second 401 within 60 s — session is truly invalid
    _first401At = null;
    clearAuth();
    _onUnauthorized?.();
  } else {
    // More than 60 s since first — reset window
    _first401At = now;
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  skipAuth = false,
): Promise<T> {
  const base = getApiBase();
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (!skipAuth && token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${base}${path}`, { ...options, headers });

  if (res.status === 401) {
    handle401();
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
  // Login must NOT send an Authorization header
  const result = await apiFetch<LoginResponse>("/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  }, true);
  // Reset the 401 grace-period counter so a fresh session starts clean
  _first401At = null;
  return result;
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

export async function fetchEscalations(mode?: "soft" | "hard" | "all"): Promise<Escalation[]> {
  const qs = mode && mode !== "all" ? `?mode=${mode}` : "";
  return apiFetch<Escalation[]>(`/escalations${qs}`);
}

export async function resolveEscalation(
  id: string,
  payload?: ResolvePayload,
): Promise<{ ok: boolean; learningEntryId?: string | null }> {
  return apiFetch(`/escalations/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
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

export async function submitGuidance(
  id: string,
  payload: GuidancePayload,
): Promise<{ ok: boolean; learningEntryId?: string | null }> {
  return apiFetch(`/escalations/${id}/guidance`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function takeoverEscalation(id: string, note?: string): Promise<void> {
  return apiFetch<void>(`/escalations/${id}/takeover`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function setEscalationMode(
  id: string,
  mode: "soft" | "hard",
): Promise<void> {
  return apiFetch<void>(`/escalations/${id}/mode`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

// ---------------------------------------------------------------------------
// Learning entries
// ---------------------------------------------------------------------------

export async function fetchLearningEntries(status?: string): Promise<LearningEntry[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<LearningEntry[]>(`/learning${qs}`);
}

export async function approveLearning(id: string): Promise<void> {
  return apiFetch<void>(`/learning/${id}/approve`, { method: "POST" });
}

export async function saveLearning(id: string): Promise<void> {
  return apiFetch<void>(`/learning/${id}/save`, { method: "POST" });
}

export async function deleteLearning(id: string): Promise<void> {
  return apiFetch<void>(`/learning/${id}`, { method: "DELETE" });
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
