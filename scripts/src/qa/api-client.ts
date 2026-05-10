/**
 * QA Simulator — Node-side read-only API client.
 *
 * Authentication:
 *   Set QA_TOKEN to the Bearer token from your browser session
 *   (DevTools → Application → Local Storage → wtyj_token_unboks).
 *
 * Environment variables:
 *   QA_API_BASE  — default https://api.unboks.org
 *   QA_CLIENT    — default unboks
 *   QA_TOKEN     — required for live mode; omit in dry-run
 *
 * SAFETY: This client only calls GET endpoints.
 * No messages are sent. No data is mutated. No alerts are triggered.
 */

const API_BASE = process.env["QA_API_BASE"] ?? "https://api.unboks.org";
const CLIENT = process.env["QA_CLIENT"] ?? "unboks";
const TOKEN = process.env["QA_TOKEN"] ?? "";

function buildBase(): string {
  return `${API_BASE}/api/${CLIENT}/dashboard/api`;
}

export class QAApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "QAApiError";
  }
}

async function apiFetch<T>(path: string): Promise<T> {
  const url = `${buildBase()}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;

  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    throw new QAApiError(
      0,
      `Network error fetching ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      msg = body.message ?? body.error ?? msg;
    } catch {
      // ignore parse error
    }
    throw new QAApiError(res.status, `${path} → ${msg}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Read-only helpers
// ---------------------------------------------------------------------------

export interface RawConversation {
  phone?: string;
  conversationId?: string;
  name?: string;
  channel?: string;
  escalated?: boolean;
  lastMessage?: string;
  timestamp?: string;
  unread?: boolean;
}

export interface RawEscalation {
  id: string;
  mode?: "soft" | "hard";
  summary?: string;
  phone?: string;
  createdAt?: string;
}

export interface RawAppointment {
  id: string;
  status?: string;
  name?: string;
  datetime?: string;
}

export interface RawAppointmentsResponse {
  connected: boolean;
  items: RawAppointment[];
}

export interface RawConfig {
  slug?: string;
  name?: string;
  [key: string]: unknown;
}

export interface RawAlertSettings {
  channels?: {
    whatsapp?: { enabled?: boolean; deliveryStatus?: string };
    email?: { enabled?: boolean };
  };
}

/** Fetch all conversations from the inbox. */
export async function fetchConversations(): Promise<RawConversation[]> {
  return apiFetch<RawConversation[]>("/messages/conversations");
}

/** Fetch escalations, optionally filtered by mode. */
export async function fetchEscalations(
  mode?: "soft" | "hard" | "all",
): Promise<RawEscalation[]> {
  const qs = mode && mode !== "all" ? `?mode=${mode}` : "";
  return apiFetch<RawEscalation[]>(`/escalations${qs}`);
}

/**
 * Fetch appointments. Returns { connected: false, items: [] } when the
 * endpoint is not wired up yet rather than throwing.
 */
export async function fetchAppointments(): Promise<RawAppointmentsResponse> {
  try {
    const raw = await apiFetch<{ items?: RawAppointment[] } | RawAppointment[]>(
      "/appointments",
    );
    const items = Array.isArray(raw)
      ? raw
      : (raw as { items?: RawAppointment[] }).items ?? [];
    return { connected: true, items };
  } catch (err) {
    if (err instanceof QAApiError && [0, 404, 501, 503].includes(err.status)) {
      return { connected: false, items: [] };
    }
    throw err;
  }
}

/** Fetch tenant config / settings. */
export async function fetchConfig(): Promise<RawConfig> {
  return apiFetch<RawConfig>("/config");
}

/** Fetch escalation alert settings. */
export async function fetchAlertSettings(): Promise<RawAlertSettings> {
  return apiFetch<RawAlertSettings>("/settings/escalation-alerts");
}

/** Return true if a JWT-style token is set. */
export function hasToken(): boolean {
  return TOKEN.length > 10;
}
