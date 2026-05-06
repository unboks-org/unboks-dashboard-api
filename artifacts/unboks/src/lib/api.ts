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
  name?: string;
  lastMessage?: string;
  timestamp?: string;
  unread?: boolean;
  /**
   * The Python backend returns the channel under `channel`. Older shapes
   * also returned it under `platform`. Both are accepted by the mapper.
   */
  channel?: string;
  platform?: string;
  hasAttachment?: boolean;
  escalated?: boolean;
  escalationMode?: EscalationMode;
  escalationSummary?: string | null;
  learningStatus?: LearningStatus;
  aiMuted?: boolean;
  // Alternative field names that different API shapes may return
  _id?: string;
  customerName?: string;
  customer_name?: string;
  senderName?: string;
  contactName?: string;
  profileName?: string;
  email?: string;
  from?: string;
  latestMessage?: string;
  last_message?: string;
  last_message_at?: string;
  last_message_role?: string;
  message_count?: number;
  status?: string;
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
  humanTakeoverAt?: string | null;
  aiMuted?: boolean;
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
  aiMuted?: boolean;
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

let _onUnauthorized: (() => void) | null = null;
let _authFailureFired = false;

export function registerUnauthorizedHandler(fn: () => void) {
  _onUnauthorized = fn;
}

/**
 * Called only on a verified authentication failure (HTTP 401 or 403 from a
 * request that DID send a Bearer token). Network/CORS/5xx errors do not
 * route here, so transient backend issues never log the user out.
 *
 * Idempotent: only fires the global handler once per session to avoid
 * redirect/toast storms when several queries fail at the same time.
 */
function handleAuthFailure() {
  if (_authFailureFired) return;
  _authFailureFired = true;
  clearAuth();
  _onUnauthorized?.();
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

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...options, headers });
  } catch (networkErr) {
    // Network failure / CORS / DNS / offline — keep the user logged in.
    // Surface as ApiError(0) so callers can distinguish from auth errors.
    throw new ApiError(0, networkErr instanceof Error ? networkErr.message : "Network error");
  }

  // Only treat as an auth failure if the request actually sent a token.
  // Unauthenticated requests (e.g., login) returning 401 are not a session expiry.
  if ((res.status === 401 || res.status === 403) && !skipAuth && token) {
    handleAuthFailure();
    throw new ApiError(res.status, res.status === 401 ? "Unauthorized" : "Forbidden");
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
  // A successful login starts a fresh session — re-arm the auth-failure latch
  _authFailureFired = false;
  return result;
}

// ---------------------------------------------------------------------------
// Conversations (Inbox)
// ---------------------------------------------------------------------------

export async function fetchConversations(): Promise<ApiConversation[]> {
  return apiFetch<ApiConversation[]>("/messages/conversations");
}

/**
 * Sanitize a conversation identifier before placing it in a URL path.
 *
 * The Python backend uses the `phone` field as the conversation key. For
 * email conversations that key can be a long, subject-derived string like
 * `email::subj:workspace-noreply@google.com:boost productivity…` which
 * sometimes carries trailing whitespace or stray CR/LF characters from
 * upstream parsing. `encodeURIComponent` would faithfully turn `\n` into
 * `%0A`, which most servers / proxies reject as a control-character path
 * smuggling attempt — manifesting as a silently empty detail pane.
 *
 * Trim and strip CR/LF defensively before encoding. We do NOT touch any
 * other characters (`:`, `@`, spaces are valid id content and round-trip
 * cleanly through encodeURIComponent).
 */
export function encodeConversationKey(rawKey: string): string {
  const cleaned = (rawKey ?? "").replace(/[\r\n]+/g, "").trim();
  return encodeURIComponent(cleaned);
}

export async function fetchConversation(phone: string): Promise<ConversationDetail> {
  const key = (phone ?? "").replace(/[\r\n]+/g, "").trim();
  if (!key) {
    throw new ApiError(400, "Conversation id is missing.");
  }
  return apiFetch<ConversationDetail>(
    `/messages/conversations/${encodeConversationKey(key)}`,
  );
}

export async function deleteConversation(phone: string): Promise<void> {
  const key = (phone ?? "").replace(/[\r\n]+/g, "").trim();
  if (!key) {
    throw new ApiError(400, "Conversation id is missing.");
  }
  return apiFetch<void>(
    `/messages/conversations/${encodeConversationKey(key)}`,
    { method: "DELETE" },
  );
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

export async function handbackEscalation(id: string): Promise<void> {
  return apiFetch<void>(`/escalations/${id}/handback`, { method: "POST" });
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
