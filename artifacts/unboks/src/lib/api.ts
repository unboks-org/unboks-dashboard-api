import { ApiError } from "@/lib/error";
import { withOperatorRequest } from "@/lib/operator-request";
import { DEBUG_LOGS_ENABLED, debugInfo } from "@/lib/debug-log";
import {
  captureTenantRequestScope,
  getApiBase,
  clearAuth,
  getClientSlug,
} from "@/lib/tenant";
import {
  formatConversationTimestamp,
  parseTimestampMs,
} from "@/lib/conversation-mapper";

// ---------------------------------------------------------------------------
// Tenant slug validation (NO hardcoded list)
// ---------------------------------------------------------------------------
//
// J3-N2-10: tenants are created in ICP (Nr 3) and become reachable from
// Nr 2 the moment the welcome email is clicked — no frontend redeploy, no
// hardcoded list, no allowlist. The previous pattern
// (^[a-z][a-z0-9_-]{1,49}$) was too narrow: any tenant slug that ICP
// generated with an uppercase letter, a leading digit, or a length over
// 50 was rejected at the URL level and never reached the backend, which
// surfaced as "workspace not recognized" / "Load Failed" from a brand
// new welcome link.
//
// The new rule is the loosest URL-safe shape that still distinguishes
// a tenant segment from junk like "/favicon.ico" or "/robots.txt":
//   - alphanumeric, underscore, or hyphen
//   - 1 to 100 characters
//   - no dots, no slashes, no extensions, no whitespace
//
// The backend (wtyj-agent) is the SOLE authority on whether a tenant
// actually exists. An unknown slug fails at login with the same generic
// error as a wrong password, so we leak no information about valid
// tenants. See TenantRootRedirect in App.tsx for the persistence rule
// (slug is only written to localStorage AFTER a successful login).

const TENANT_SLUG_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export function isValidTenantSlug(slug: string | null | undefined): boolean {
  if (!slug || typeof slug !== "string") return false;
  return TENANT_SLUG_PATTERN.test(slug);
}

// Backward-compat string alias so existing call sites
// (login(password, client: ValidClient)) compile without churn.
// The actual shape check happens at the boundary via isValidTenantSlug().
export type ValidClient = string;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscalationMode = "soft" | "hard" | "order" | null;
export type LearningStatus = "none" | "suggested" | "approved" | "saved";

/** Staff-only operational note. This object must never be projected into
 * guest-facing documents or public links. Acknowledgement clears the staff
 * task, not the underlying note. */
export interface MermaidCrewAssistance {
  id: string;
  kind: "wheelchair";
  note: string;
  relationship: string | null;
  tripDate: string | null;
  reservationPublicId: string | null;
  status: "unacknowledged" | "acknowledged" | "withdrawn";
  revision: number;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

export interface MermaidCrewAssistanceQueueItem
  extends MermaidCrewAssistance {
  conversationId: string;
  customerName: string;
}

export interface ApiConversation {
  phone: string;
  /**
   * Backend-routable conversation key. Email threads in particular do
   * NOT use `phone` as the addressable key — the Python backend mints
   * a stable thread id (e.g. `email::subj:from@x.com:subject…`) and
   * exposes it under one of these aliases. The mapper picks the first
   * non-empty value and surfaces it as `Conversation.conversationKey`
   * so email Reply / Forward / Delete can target the correct thread
   * even when `phone` happens to be a Mongo ObjectId or a display id.
   */
  conversationId?: string;
  conversation_id?: string;
  threadKey?: string;
  thread_key?: string;
  external_id?: string;
  externalId?: string;
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
  appointmentSignal?: boolean;
  appointment_signal?: boolean;
  appointmentDetected?: boolean;
  appointment_detected?: boolean;
  hasAppointment?: boolean;
  has_appointment?: boolean;
  escalationMode?: EscalationMode;
  intent?: string | null;
  is_order?: boolean;
  isOrder?: boolean;
  order_status?: string | null;
  orderStatus?: string | null;
  order_payload?: Record<string, unknown> | null;
  orderPayload?: Record<string, unknown> | null;
  badge_type?: string | null;
  badgeType?: string | null;
  queue_type?: string | null;
  queueType?: string | null;
  human_action_required?: boolean;
  humanActionRequired?: boolean;
  next_operator_action?: string | null;
  nextOperatorAction?: string | null;
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
  /**
   * Who sent the message.
   *   - "user"      — the customer (inbound from any channel)
   *   - "assistant" — Marina (the AI agent)
   *   - "operator"  — a human teammate replying directly to the customer
   *                  (human takeover, "Team will confirm" replies, etc.)
   *
   * The thread renderer styles each role distinctly so the operator
   * can tell at a glance which side spoke. Backend role names map
   * via `normalizeMessage` (see lib/api.ts) — `operator | staff |
   * team | teammate | human | admin | support` all collapse to
   * "operator". `agent` keeps mapping to "assistant" since Marina is
   * the agent.
   */
  role: "user" | "assistant" | "operator";
  content: string;
  /** Display-formatted timestamp (e.g. "9:42 AM", "Yesterday", "3 Nov"). */
  timestamp: string;
  /**
   * Parsed milliseconds-since-epoch for the original backend timestamp,
   * or 0 if the field was missing / not a real date. Used to sort the
   * message thread newest-first without re-parsing the display string
   * (which is lossy — "9:42 AM" has no date).
   */
  timestampMs: number;
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
  /**
   * Backend-supplied "what the customer wants" line. When the prompt
   * provides this directly, the briefing panel uses it verbatim
   * instead of re-deriving from message text.
   */
  customerWants?: string | null;
  /**
   * Backend-supplied "what the operator needs to decide" line.
   * Surfaced as the "Suggested next step" row when present.
   */
  operatorNeedsToDecide?: string | null;
  /** Guest message captured with the escalation, distinct from later follow-ups. */
  escalationCustomerMessage?: string | null;
  humanGuidance?: string | null;
  humanResponder?: string | null;
  humanRespondedAt?: string | null;
  humanTakeoverAt?: string | null;
  aiMuted?: boolean;
  learningStatus?: LearningStatus;
  /**
   * Backend-supplied recommended options for the operator. When present,
   * EVERY entry must be rendered as its own chip in the briefing panel,
   * in order, with no slicing and no collapsing of duplicates.
   */
  recommendedOptions?: string[] | null;
  /**
   * Structured details extracted from the conversation by the backend.
   * `proposedTimes` is the canonical source for scheduling chips: each
   * entry becomes its own "Confirm <time>" option. Multiple times must
   * never be collapsed into a single generic chip.
   */
  extractedDetails?: {
    proposedTimes?: string[] | null;
  } | null;
  /** Structured staff-only note; ordinary wheelchair use is not escalation. */
  crewAssistance?: MermaidCrewAssistance | null;
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
  request_id?: string;
  saveToYourInfo?: boolean;
  autoUseNextTime?: boolean;
  category?: string;
  mediaId?: string;
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

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------
//
// Appointments are surfaced in Workspace → Appointments. The product
// rule is:
//
//   When a customer asks to meet/book/activate, gives availability, and
//   the operator (or Marina) confirms a specific date/time (and ideally
//   a location), the system shows it as an appointment.
//
// The backend will expose the canonical appointments collection at
// `/appointments` (see GET/POST/PATCH/DELETE in the spec). Until that
// endpoint is live the frontend falls back to a detection layer that
// reads the same conversations the operator already sees and renders
// rows as "Pending sync" / "Detected" so nothing slips between the
// cracks. The status field below carries that distinction so backend
// rows can land alongside detected ones without losing fidelity.

export type AppointmentStatus = "confirmed" | "pending" | "detected";
export type AppointmentSource =
  | "conversation"
  | "backend"
  | "order_escalation"
  | "order_state";

export interface Appointment {
  id: string;
  customerName: string;
  /** Lower-cased channel slug (e.g. "whatsapp", "email"). */
  channel: string;
  /** Conversation key (phone / email key) used to deep-link back. */
  conversationId: string;
  title: string;
  dateTimeLabel: string;
  location?: string | null;
  status: AppointmentStatus;
  source: AppointmentSource;
  createdAt: string;
  order?: OrderDetails | null;
  orderStatus?: OrderQueueStatus | null;
  humanActionRequired?: boolean;
  nextOperatorAction?: string | null;
  escalationId?: string | null;
}

export interface OrderLine {
  name: string;
  quantity: number | null;
  unitPrice?: number | null;
  subtotal?: number | null;
}

export interface OrderDetails {
  customerName: string;
  phone: string;
  channel?: string | null;
  address: string;
  products: OrderLine[];
  productTotal?: number | null;
  deliveryCost?: number | null;
  total: number | null;
  currency: string;
  comments?: string | null;
}

export interface ProductSettings {
  deliveryCostAmount: number | null;
  deliveryCostCurrency: string;
}

export type OrderQueueStatus =
  | "collecting_details"
  | "awaiting_customer_confirmation"
  | "awaiting_human_confirmation"
  | "confirmed"
  | "rejected"
  | "resolved";

export interface AppointmentsResponse {
  /**
   * True when `/appointments` returned a real response (even an empty
   * list). False when the endpoint isn't connected yet (404 / 501 /
   * 503 / network). Drives the "Pending sync" copy on the page so an
   * empty-but-connected backend never gets mislabelled as not connected.
   */
  connected: boolean;
  items: Appointment[];
}

export interface OrdersResponse {
  connected: boolean;
  items: Appointment[];
}

export type FollowUpStatus =
  | "active"
  | "missing_information"
  | "collecting"
  | "ready_to_call"
  | "ready_to_quote"
  | "needs_an_answer"
  | "needs_human_answer"
  | "in_progress"
  | "copied"
  | "appointment_coordinated"
  | "no_answer"
  | "closed";
export type AliReservationStatus =
  | "availability_pending"
  | "requirements_pending"
  | "alternative_required"
  | "declined"
  | "ready_to_confirm"
  | "confirmed"
  | "cancelled"
  | "superseded";
export type AliChecklistStatus =
  | "awaiting_external_check"
  | "not_sent"
  | "sent_external"
  | "not_requested"
  | "awaiting_manual_verification"
  | "verified"
  | "not_required"
  | "rejected";
export interface FollowUp {
  id: number | string;
  conversation_id: string;
  channel: string;
  first_name: string;
  surnames: string;
  phone_raw: string;
  phone_normalized?: string;
  callback_preference: string;
  appointment_preference?: string;
  session_type?: string;
  preferred_clinic?: string;
  customer_name?: string;
  pickup_datetime?: string;
  return_datetime?: string;
  pickup_location?: string;
  return_location?: string;
  driver_age?: number | string;
  passenger_count?: number | string;
  vehicle_preference?: string;
  flight_number?: string;
  luggage?: string;
  child_seat?: string;
  notes?: string;
  workflow_type?: string;
  required_fields?: string[];
  missing_fields?: string[];
  field_labels?: Record<string, string>;
  complete?: boolean;
  rental_period?: string;
  unread_count?: number;
  next_action?: string;
  quote_reference?: string | null;
  quote_status?: string | null;
  quote_delivery_state?: "not_started" | "pending" | "failed" | "delivered";
  whatsapp_status?: string | null;
  staff_email_status?: string | null;
  post_quote_status?: AliReservationStatus | null;
  availability_status?:
    | "pending"
    | "approved"
    | "alternative"
    | "declined"
    | null;
  identity_status?: AliChecklistStatus | null;
  agreement_status?: AliChecklistStatus | null;
  payment_status?: AliChecklistStatus | null;
  reservation_public_id?: string | null;
  reservation_reference?: string | null;
  reservation_revision?: number | null;
  visit_reason: string;
  status: FollowUpStatus;
  handoff_reason: string;
  created_at: string;
  updated_at: string;
  last_inbound_at?: string;
}

export async function fetchFollowUps(
  status?: FollowUpStatus,
): Promise<FollowUp[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("_refresh", Date.now().toString());
  const raw = await apiFetch<{ items?: FollowUp[]; followUps?: FollowUp[] }>(
    `/follow-ups?${params.toString()}`,
    {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    },
  );
  return raw.items ?? raw.followUps ?? [];
}

export async function fetchQuoteLeads(
  status?: FollowUpStatus,
): Promise<FollowUp[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("_refresh", Date.now().toString());
  const raw = await apiFetch<{ items?: FollowUp[]; quoteLeads?: FollowUp[] }>(
    `/quote-leads?${params.toString()}`,
    {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    },
  );
  return raw.items ?? raw.quoteLeads ?? [];
}

export async function decideAliReservationAvailability(
  publicId: string,
  decision: "approve" | "decline",
  expectedRevision?: number | null,
): Promise<unknown> {
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/availability-decision`,
    {
      method: "POST",
      body: JSON.stringify({
        decision,
        ...(expectedRevision ? { expectedRevision } : {}),
      }),
    },
  );
}

export async function updateAliReservationChecklist(
  publicId: string,
  field: "identity" | "agreement" | "payment",
  status: "verified" | "not_required",
  expectedRevision?: number | null,
): Promise<unknown> {
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/checklist`,
    {
      method: "PATCH",
      body: JSON.stringify({
        [field]: status,
        ...(expectedRevision ? { expectedRevision } : {}),
      }),
    },
  );
}

export async function confirmAliReservation(
  publicId: string,
  expectedRevision?: number | null,
): Promise<unknown> {
  return apiFetch(`/ali-reservations/${encodeURIComponent(publicId)}/confirm`, {
    method: "POST",
    body: JSON.stringify(expectedRevision ? { expectedRevision } : {}),
  });
}

export type AliDocumentSlot =
  | "license_front"
  | "license_back"
  | "identity"
  | "passport"
  | "identity_front"
  | "identity_back"
  | "unclassified";
export type AliDocumentStatus =
  | "received"
  | "unclassified"
  | "quarantined"
  | "verified"
  | "rejected"
  | "replacement_requested"
  | "replaced"
  | "deleted"
  | "not_required";

export interface AliReservationDocument {
  public_id: string;
  slot: AliDocumentSlot;
  version: number;
  mime_type: string | null;
  size_bytes: number;
  sha256: string | null;
  status: AliDocumentStatus;
  previous_document_public_id: string | null;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
  verified_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  original_filename?: string | null;
  quarantine_status?: string | null;
  classification_source?: string | null;
  unclassified_expires_at?: string | null;
  review_reason?: string | null;
}

export interface AliReservationWorkflowV2 {
  reservationPublicId: string;
  workflowVersion: 2;
  state: string;
  responsibleParty: "Client" | "Staff" | "System";
  clock: {
    state: "running" | "paused" | "stopped";
    pauseReason: string | null;
    activeClientSeconds: number;
    remainingSeconds: number;
    holdSeconds: number;
    clientTimezone: string;
  };
  reminders: {
    milestonesSeconds: number[];
    nextMilestoneSeconds: number | null;
    sendEnabled: boolean;
  };
  nextAction: string;
  doNotContact: boolean;
  cancellationReason: string | null;
  negativeIntentPending: boolean;
  identityType: "passport" | "id_card" | null;
  expectedDocumentSlot: AliDocumentSlot | null;
  revision: number;
  lastClientActivityAt: string | null;
  lastOutboundAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AliReservationContract {
  public_id: string;
  version: number;
  template_version: string;
  template_sha256: string;
  snapshot_sha256: string;
  status: "not_sent" | "sent" | "viewed" | "signed" | "rejected" | "superseded";
  signed_pdf_sha256: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AliReservationEvent {
  event_public_id: string;
  event_type: string;
  actor_type: string;
  actor_id: string;
  from_status: string;
  to_status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AliCustomerFile {
  public_id: string;
  revision: number;
  status: AliReservationStatus;
  availability_status: "pending" | "approved" | "alternative" | "declined";
  identity_status:
    | AliChecklistStatus
    | "requested"
    | "partially_received"
    | "received"
    | "replacement_requested";
  agreement_status: AliChecklistStatus | "sent" | "viewed" | "signed";
  payment_status:
    | AliChecklistStatus
    | "not_sent"
    | "link_sent"
    | "customer_reports_paid";
  dossier_status: "incomplete" | "ready_for_review" | "approved";
  dossier_version: number;
  dossier_review_status:
    | "not_generated"
    | "incomplete"
    | "ready_for_review"
    | "approved";
  dossier_ready_for_approval: boolean;
  checklist_complete: boolean;
  can_confirm: boolean;
  pickup_checklist: {
    original_license_inspected: boolean;
    original_license_inspected_at: string | null;
    original_license_inspected_by: string | null;
    original_identity_inspected: boolean;
    original_identity_inspected_at: string | null;
    original_identity_inspected_by: string | null;
  };
  missing_requirements: string[];
  quote_reference: string;
  confirmation_reference: string | null;
  customer: Record<string, unknown>;
  rental: Record<string, unknown>;
  pricing: Record<string, unknown>;
  documents: AliReservationDocument[];
  contract: AliReservationContract | null;
  payment: {
    status: string;
    mode: "fixed_link" | "per_reservation";
    providerName: string;
    tenantDefaultAvailable: boolean;
    tenantDefaultDomain: string | null;
    domain: string | null;
    reference: string | null;
    linkSentAt: string | null;
    customerReportedAt: string | null;
    verifiedAt: string | null;
    verifiedBy: string | null;
    reviewReason: string | null;
  };
  events: AliReservationEvent[];
  final_notes: string;
  workflow_v2?: AliReservationWorkflowV2;
  prepayment_review?: {
    status: string;
    approvalRequired: boolean;
    approved: boolean;
    readyForApproval: boolean;
    paymentReady: boolean;
    canApproveAndSend: boolean;
    requiredDocumentCount: number;
    receivedDocumentCount: number;
    missingRequirements: string[];
  };
}

export interface AliDossierConfiguration {
  enabled: boolean;
  ready: boolean;
  configurationReady: boolean;
  blockers: string[];
}

export interface AliDossierTenantSettings {
  status: AliDossierConfiguration;
  contractTemplate: {
    publicId: string | null;
    version: string;
    sourceFilename: string;
    sha256: string | null;
    uploadedAt: string | null;
  } | null;
  payment: {
    mode: "fixed_link" | "per_reservation";
    providerName: string;
    defaultLinkConfigured: boolean;
    defaultDomain: string | null;
    allowedDomains: string[];
  };
  retention: {
    documentRetentionDays: number;
    paperShreddingPolicy: string;
  };
}

export interface AliDossierTenantSettingsUpdate {
  paymentMode: "fixed_link" | "per_reservation";
  paymentProviderName: string;
  paymentUrl?: string;
  clearPaymentUrl: boolean;
  paymentAllowedDomains: string[];
  documentRetentionDays: number;
  paperShreddingPolicy: string;
}

export interface AliReservationV2Settings {
  holdActiveClientHours: number;
  reminderActiveClientHours: number[];
  quietHoursStart: string;
  quietHoursEnd: string;
  defaultTimezone: string;
  reminderSendEnabled: boolean;
}

export type AliReservationV2SettingsUpdate = Omit<
  AliReservationV2Settings,
  "reminderSendEnabled"
>;

export function fetchAliDossierConfiguration(): Promise<AliDossierConfiguration> {
  return apiFetch<AliDossierConfiguration>("/ali-dossier/configuration", {
    cache: "no-store",
  });
}

export function fetchAliDossierSettings(): Promise<AliDossierTenantSettings> {
  return apiFetch<AliDossierTenantSettings>("/ali-dossier/settings", {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
}

export function fetchAliReservationV2Settings(): Promise<AliReservationV2Settings> {
  return apiFetch<AliReservationV2Settings>("/ali-reservation-v2/settings", {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
}

export function updateAliReservationV2Settings(
  value: AliReservationV2SettingsUpdate,
): Promise<AliReservationV2Settings> {
  return apiFetch<AliReservationV2Settings>("/ali-reservation-v2/settings", {
    method: "PUT",
    cache: "no-store",
    body: JSON.stringify(value),
  });
}

export function updateAliDossierSettings(
  value: AliDossierTenantSettingsUpdate,
): Promise<AliDossierTenantSettings> {
  return apiFetch<AliDossierTenantSettings>("/ali-dossier/settings", {
    method: "PUT",
    cache: "no-store",
    body: JSON.stringify(value),
  });
}

export function updateAliDossierActivation(
  enabled: boolean,
): Promise<AliDossierTenantSettings> {
  return apiFetch<AliDossierTenantSettings>(
    "/ali-dossier/settings/activation",
    {
      method: "PUT",
      cache: "no-store",
      body: JSON.stringify({ enabled }),
    },
  );
}

export function uploadAliContractTemplate(
  version: string,
  file: File,
): Promise<AliDossierTenantSettings> {
  const body = new FormData();
  body.set("version", version);
  body.set("file", file);
  return apiFetch<AliDossierTenantSettings>(
    "/ali-dossier/settings/contract-template",
    { method: "POST", cache: "no-store", body },
  );
}

export function fetchAliCustomerFile(
  publicId: string,
): Promise<AliCustomerFile> {
  return apiFetch<AliCustomerFile>(
    `/ali-reservations/${encodeURIComponent(publicId)}/customer-file`,
    {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    },
  );
}

function revisionBody(
  expectedRevision: number,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({ ...extra, expectedRevision });
}

export function requestAliDocuments(
  publicId: string,
  expectedRevision: number,
): Promise<unknown> {
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/documents/request`,
    {
      method: "POST",
      body: revisionBody(expectedRevision),
    },
  );
}

export function reviewAliDocument(
  publicId: string,
  documentId: string,
  decision: "verified" | "rejected" | "replacement_requested",
  expectedRevision: number,
  reason = "",
): Promise<unknown> {
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/documents/${encodeURIComponent(documentId)}/review`,
    {
      method: "POST",
      body: revisionBody(expectedRevision, { decision, reason }),
    },
  );
}

export function requestAliDocumentReplacement(
  publicId: string,
  documentId: string,
  expectedRevision: number,
  reason: string,
): Promise<unknown> {
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/documents/${encodeURIComponent(documentId)}/request-replacement`,
    { method: "POST", body: revisionBody(expectedRevision, { reason }) },
  );
}

export function reclassifyAliDocument(
  publicId: string,
  documentId: string,
  slot: Exclude<AliDocumentSlot, "identity" | "unclassified">,
  expectedRevision: number,
): Promise<unknown> {
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/documents/${encodeURIComponent(documentId)}/reclassify`,
    {
      method: "POST",
      body: revisionBody(expectedRevision, { slot }),
    },
  );
}

export function markAliLicenseBackNotRequired(
  publicId: string,
  expectedRevision: number,
): Promise<unknown> {
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/documents/not-required`,
    {
      method: "POST",
      body: revisionBody(expectedRevision, { slot: "license_back" }),
    },
  );
}

export function deleteAliDocument(
  publicId: string,
  documentId: string,
  expectedRevision: number,
): Promise<unknown> {
  const revision = new URLSearchParams({
    expectedRevision: String(expectedRevision),
  });
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/documents/${encodeURIComponent(documentId)}?${revision}`,
    { method: "DELETE" },
  );
}

export function sendAliContract(
  publicId: string,
  expectedRevision: number,
): Promise<unknown> {
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/contract/send`,
    {
      method: "POST",
      body: revisionBody(expectedRevision),
    },
  );
}

export function setAliPaymentLink(
  publicId: string,
  url: string,
  reference: string,
  expectedRevision: number,
): Promise<unknown> {
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/payment-link`,
    {
      method: "PUT",
      body: revisionBody(expectedRevision, { url, reference }),
    },
  );
}

export function sendAliPaymentLink(publicId: string): Promise<unknown> {
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/payment-link/send`,
    {
      method: "POST",
      body: "{}",
    },
  );
}

export function approveAliPrepaymentFile(
  publicId: string,
  expectedWorkflowRevision: number,
): Promise<{ approved: boolean; delivered: boolean }> {
  return apiFetch<{ approved: boolean; delivered: boolean }>(
    `/ali-reservations/${encodeURIComponent(publicId)}/prepayment-review`,
    {
      method: "POST",
      body: JSON.stringify({
        decision: "approve",
        expectedWorkflowRevision,
      }),
    },
  );
}

export function reviewAliPayment(
  publicId: string,
  decision: "verified" | "rejected" | "not_required",
  expectedRevision: number,
  reason = "",
): Promise<unknown> {
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/payment/review`,
    {
      method: "POST",
      body: revisionBody(expectedRevision, { decision, reason }),
    },
  );
}

export function updateAliFinalNotes(
  publicId: string,
  notes: string,
  expectedRevision: number,
): Promise<unknown> {
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/final-notes`,
    {
      method: "PATCH",
      body: revisionBody(expectedRevision, { notes }),
    },
  );
}

export function recordAliPickupInspection(
  publicId: string,
  item: "license" | "identity",
  expectedRevision: number,
): Promise<unknown> {
  return apiFetch(
    `/ali-reservations/${encodeURIComponent(publicId)}/pickup-inspection`,
    {
      method: "POST",
      body: revisionBody(expectedRevision, { item }),
    },
  );
}

async function fetchAliPrivateBlob(
  path: string,
  expectedMimes: readonly string[],
): Promise<Blob> {
  const { tenantSlug, token } = captureTenantRequestScope();
  const response = await fetch(`${getApiBase(tenantSlug)}${path}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  if ((response.status === 401 || response.status === 403) && token) {
    handleAuthFailure(tenantSlug);
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      "Private document could not be loaded.",
    );
  if (getClientSlug() !== tenantSlug)
    throw new ApiError(409, "Workspace response rejected");
  const blob = await response.blob();
  if (!expectedMimes.some((mime) => blob.type.startsWith(mime))) {
    throw new ApiError(422, "Unexpected private document format.");
  }
  return blob;
}

export function fetchAliDocumentBlob(
  publicId: string,
  documentId: string,
): Promise<Blob> {
  return fetchAliPrivateBlob(
    `/ali-reservations/${encodeURIComponent(publicId)}/documents/${encodeURIComponent(documentId)}/content`,
    ["image/", "application/pdf"],
  );
}

export function fetchAliSignedContractBlob(publicId: string): Promise<Blob> {
  return fetchAliPrivateBlob(
    `/ali-reservations/${encodeURIComponent(publicId)}/contract/signed`,
    ["application/pdf"],
  );
}

export function fetchAliDossierBlob(
  publicId: string,
  expectedRevision: number,
  allowIncomplete: boolean,
  pageSize: "A4" | "LETTER" = "A4",
): Promise<Blob> {
  const path = `/ali-reservations/${encodeURIComponent(publicId)}/dossier.pdf`;
  const { tenantSlug, token } = captureTenantRequestScope();
  return fetch(`${getApiBase(tenantSlug)}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    body: revisionBody(expectedRevision, { allowIncomplete, pageSize }),
  }).then(async (response) => {
    if ((response.status === 401 || response.status === 403) && token)
      handleAuthFailure(tenantSlug);
    if (!response.ok)
      throw new ApiError(response.status, "Dossier could not be generated.");
    if (getClientSlug() !== tenantSlug)
      throw new ApiError(409, "Workspace response rejected");
    const blob = await response.blob();
    if (!blob.type.startsWith("application/pdf"))
      throw new ApiError(422, "Unexpected dossier format.");
    return blob;
  });
}

export async function updateFollowUpStatus(
  id: number,
  status: FollowUpStatus,
): Promise<FollowUp> {
  return apiFetch<FollowUp>(`/follow-ups/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

/**
 * Try to fetch appointments from the canonical backend endpoint. If the
 * endpoint isn't connected yet (404 / 501 / 503 / network), resolve to
 * `{ connected: false, items: [] }` so the frontend detection layer can
 * still render rows.
 *
 * We deliberately do NOT throw on missing endpoint: the page should
 * render normally and the detected rows will fill the void. A real auth
 * failure (401/403) still propagates and triggers the global handler.
 */
export async function fetchAppointments(): Promise<AppointmentsResponse> {
  try {
    const raw = await apiFetch<unknown>("/appointments");
    return { connected: true, items: normalizeAppointmentList(raw) };
  } catch (err) {
    if (err instanceof ApiError && APPOINTMENTS_NOT_CONNECTED.has(err.status)) {
      return { connected: false, items: [] };
    }
    if (
      err instanceof Error &&
      (err.name === "TypeError" || err.message === "Failed to fetch")
    ) {
      return { connected: false, items: [] };
    }
    throw err;
  }
}

const APPOINTMENTS_NOT_CONNECTED = new Set([0, 404, 501, 503]);

export async function fetchOrders(): Promise<OrdersResponse> {
  try {
    const raw = await apiFetch<unknown>("/orders");
    return { connected: true, items: normalizeOrderList(raw) };
  } catch (err) {
    if (err instanceof ApiError && APPOINTMENTS_NOT_CONNECTED.has(err.status)) {
      return { connected: false, items: [] };
    }
    if (
      err instanceof Error &&
      (err.name === "TypeError" || err.message === "Failed to fetch")
    ) {
      return { connected: false, items: [] };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Cloud knowledge connections
// ---------------------------------------------------------------------------
//
// Backend contract (issue unboks-org/unboks-dashboard-api#29):
//   GET /api/{tenant}/dashboard/api/knowledge/cloud-connections
//   200: { providers: CloudConnectionProvider[] }
//
// The backend is the single source of truth for which providers are even
// shown — the frontend renders ONLY what it returns. SharePoint and Box
// are intentionally absent from the product, so they are absent from the
// response and the UI never mentions them.
//
// `status` drives the action button:
//   - "connected"        → Connected badge + folder + last_synced
//   - "setup_required"   → Setup required + Connect (may route to OAuth
//                          when `needs_provider_app_registration` is
//                          false; otherwise disabled with a help line)
//   - "not_configured"   → Setup pending / Contact Unboks team
//                          (Connect button always disabled)

export type CloudConnectionStatus =
  | "connected"
  | "setup_required"
  | "not_configured";

export type CloudConnectionProviderId = "google_drive" | "onedrive" | "dropbox";

export interface CloudConnectionProvider {
  provider: CloudConnectionProviderId;
  label: string;
  blurb: string;
  status: CloudConnectionStatus;
  needs_provider_app_registration: boolean;
  folder_name?: string | null;
  last_synced_at?: string | null;
}

export interface CloudConnectionsResponse {
  providers: CloudConnectionProvider[];
}

const ALLOWED_CLOUD_PROVIDERS: ReadonlySet<CloudConnectionProviderId> = new Set(
  ["google_drive", "onedrive", "dropbox"],
);

const ALLOWED_CLOUD_STATUSES: ReadonlySet<CloudConnectionStatus> = new Set([
  "connected",
  "setup_required",
  "not_configured",
]);

export async function fetchCloudConnections(): Promise<CloudConnectionsResponse> {
  const raw = await apiFetch<unknown>("/knowledge/cloud-connections");
  return { providers: normalizeCloudConnections(raw) };
}

function normalizeCloudConnections(raw: unknown): CloudConnectionProvider[] {
  let items: unknown[] = [];
  if (Array.isArray(raw)) items = raw;
  else if (raw && typeof raw === "object") {
    const maybe = (raw as Record<string, unknown>).providers;
    if (Array.isArray(maybe)) items = maybe;
  }
  const out: CloudConnectionProvider[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const providerRaw = pickStr(o, "provider", "id");
    if (!providerRaw) continue;
    // Hard filter: never render SharePoint / Box even if the backend
    // accidentally surfaces them. The product decision in #29 is
    // explicit — only Google Drive, OneDrive, Dropbox.
    if (
      !ALLOWED_CLOUD_PROVIDERS.has(providerRaw as CloudConnectionProviderId)
    ) {
      continue;
    }
    const statusRaw = (pickStr(o, "status") ?? "").toLowerCase();
    const status: CloudConnectionStatus = ALLOWED_CLOUD_STATUSES.has(
      statusRaw as CloudConnectionStatus,
    )
      ? (statusRaw as CloudConnectionStatus)
      : "not_configured";
    out.push({
      provider: providerRaw as CloudConnectionProviderId,
      label:
        pickStr(o, "label") ??
        defaultProviderLabel(providerRaw as CloudConnectionProviderId),
      blurb: pickStr(o, "blurb") ?? "",
      status,
      needs_provider_app_registration:
        o.needs_provider_app_registration === true ||
        o.needsProviderAppRegistration === true,
      folder_name: pickStr(o, "folder_name", "folderName"),
      last_synced_at: pickStr(o, "last_synced_at", "lastSyncedAt"),
    });
  }
  return out;
}

function defaultProviderLabel(p: CloudConnectionProviderId): string {
  switch (p) {
    case "google_drive":
      return "Google Drive";
    case "onedrive":
      return "OneDrive";
    case "dropbox":
      return "Dropbox";
  }
}

// ---------------------------------------------------------------------------
// Knowledge files
// ---------------------------------------------------------------------------
//
// Backend contract:
//   GET    /api/{tenant}/dashboard/api/knowledge/files
//   POST   /api/{tenant}/dashboard/api/knowledge/files
//          multipart/form-data: file=<document>
//   DELETE /api/{tenant}/dashboard/api/knowledge/files/{id}
//
// The backend stores the file, extracts readable text, and Marina reads
// rows with status="ready" into the prompt as uploaded source-of-truth
// material. The frontend does not keep a local fake list.

export type KnowledgeFileStatus = "pending" | "processing" | "ready" | "failed";

export interface KnowledgeFile {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: KnowledgeFileStatus;
  uploadedAt: string;
  lastUsedAt?: string;
}

const ALLOWED_KNOWLEDGE_FILE_STATUSES: ReadonlySet<KnowledgeFileStatus> =
  new Set(["pending", "processing", "ready", "failed"]);

function normalizeKnowledgeFile(raw: unknown): KnowledgeFile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = pickStr(o, "id");
  const filename = pickStr(o, "filename", "name");
  if (!id || !filename) return null;
  const statusRaw = (pickStr(o, "status") ?? "pending").toLowerCase();
  const status = ALLOWED_KNOWLEDGE_FILE_STATUSES.has(
    statusRaw as KnowledgeFileStatus,
  )
    ? (statusRaw as KnowledgeFileStatus)
    : "pending";
  return {
    id,
    filename,
    mimeType:
      pickStr(o, "mimeType", "mime_type", "contentType", "content_type") ?? "",
    sizeBytes: Number(o.sizeBytes ?? o.size_bytes ?? 0) || 0,
    status,
    uploadedAt: pickStr(o, "uploadedAt", "uploaded_at") ?? "",
    lastUsedAt: pickStr(o, "lastUsedAt", "last_used_at") ?? undefined,
  };
}

function normalizeKnowledgeFiles(raw: unknown): KnowledgeFile[] {
  const items = Array.isArray(raw)
    ? raw
    : raw &&
        typeof raw === "object" &&
        Array.isArray((raw as Record<string, unknown>).files)
      ? ((raw as Record<string, unknown>).files as unknown[])
      : [];
  return items
    .map(normalizeKnowledgeFile)
    .filter((f): f is KnowledgeFile => Boolean(f));
}

export async function fetchKnowledgeFiles(): Promise<KnowledgeFile[]> {
  const raw = await apiFetch<unknown>("/knowledge/files");
  return normalizeKnowledgeFiles(raw);
}

export async function uploadKnowledgeFile(file: File): Promise<KnowledgeFile> {
  const body = new FormData();
  body.append("file", file);
  const raw = await apiFetch<unknown>("/knowledge/files", {
    method: "POST",
    body,
  });
  const normalized = normalizeKnowledgeFile(raw);
  if (!normalized) {
    throw new ApiError(
      500,
      "Upload completed, but the server returned an invalid file record.",
    );
  }
  return normalized;
}

export async function deleteKnowledgeFile(fileId: string): Promise<void> {
  await apiFetch<void>(`/knowledge/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Knowledge media
// ---------------------------------------------------------------------------
//
// Images are attached to saved knowledge items (for example a property,
// product, menu item, or service). They are not OCR'd. The backend stores
// tenant-scoped images and returns safe public links Marina can share when a
// customer asks for photos.

export interface KnowledgeMedia {
  id: string;
  knowledgeSource: string;
  knowledgeId: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  caption: string;
  url: string;
  uploadedAt: string;
  lastUsedAt?: string;
}

function normalizeKnowledgeMedia(raw: unknown): KnowledgeMedia | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = pickStr(o, "id");
  const knowledgeId = pickStr(o, "knowledgeId", "knowledge_id");
  if (!id || !knowledgeId) return null;
  return {
    id,
    knowledgeSource:
      pickStr(o, "knowledgeSource", "knowledge_source") ?? "info_update",
    knowledgeId,
    filename: pickStr(o, "filename") ?? "",
    originalFilename: pickStr(o, "originalFilename", "original_filename") ?? "",
    mimeType: pickStr(o, "mimeType", "mime_type") ?? "image/jpeg",
    sizeBytes: Number(o.sizeBytes ?? o.size_bytes ?? 0) || 0,
    caption: pickStr(o, "caption") ?? "",
    url: pickStr(o, "url") ?? "",
    uploadedAt: pickStr(o, "uploadedAt", "uploaded_at") ?? "",
    lastUsedAt: pickStr(o, "lastUsedAt", "last_used_at") ?? undefined,
  };
}

function normalizeKnowledgeMediaList(raw: unknown): KnowledgeMedia[] {
  const items = Array.isArray(raw)
    ? raw
    : raw &&
        typeof raw === "object" &&
        Array.isArray((raw as Record<string, unknown>).media)
      ? ((raw as Record<string, unknown>).media as unknown[])
      : [];
  return items
    .map(normalizeKnowledgeMedia)
    .filter((m): m is KnowledgeMedia => Boolean(m));
}

export async function fetchKnowledgeMedia(
  knowledgeId: string,
  source = "info_update",
): Promise<KnowledgeMedia[]> {
  const params = new URLSearchParams({
    knowledge_id: knowledgeId,
    source,
  });
  const raw = await apiFetch<unknown>(`/knowledge/media?${params.toString()}`);
  return normalizeKnowledgeMediaList(raw);
}

export async function fetchKnowledgeMediaLibrary(): Promise<KnowledgeMedia[]> {
  const raw = await apiFetch<unknown>("/knowledge/media/library");
  return normalizeKnowledgeMediaList(raw);
}

export async function uploadKnowledgeMedia(input: {
  knowledgeId: string;
  source?: string;
  caption?: string;
  file: File;
}): Promise<KnowledgeMedia> {
  const body = new FormData();
  body.append("knowledge_id", input.knowledgeId);
  body.append("source", input.source ?? "info_update");
  body.append("caption", input.caption ?? "");
  body.append("file", input.file);
  const raw = await apiFetch<unknown>("/knowledge/media", {
    method: "POST",
    body,
  });
  const normalized = normalizeKnowledgeMedia(raw);
  if (!normalized) {
    throw new ApiError(
      500,
      "Upload completed, but the server returned an invalid image record.",
    );
  }
  return normalized;
}

export async function deleteKnowledgeMedia(mediaId: string): Promise<void> {
  await apiFetch<void>(`/knowledge/media/${encodeURIComponent(mediaId)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Block sender (Unboks-level block)
// ---------------------------------------------------------------------------
//
// Backend contract (issue unboks-org/unboks-dashboard-api#30):
//   POST   /dashboard/api/messages/conversations/{conversationId}/block
//          body: { reason, blocked_by }
//   POST   /dashboard/api/messages/conversations/{conversationId}/unblock
//   GET    /dashboard/api/blocked-senders
//          200: { conversations: BlockedSender[] }
//
// "Block in Unboks" only suppresses the conversation inside this dashboard:
// future inbound messages do not appear in the active inbox, the Agent does
// not auto-reply, and escalation alerts do not fire. It does NOT block the
// contact at the channel layer (e.g. WhatsApp) — operators must do that on
// the phone separately if they want the contact to stop reaching them at
// all. Historical messages are preserved.

export type BlockReason = "spam" | "abusive" | "wrong_contact" | "other";

export const BLOCK_REASONS: ReadonlyArray<{
  value: BlockReason;
  label: string;
}> = [
  { value: "spam", label: "Spam" },
  { value: "abusive", label: "Abusive" },
  { value: "wrong_contact", label: "Wrong contact" },
  { value: "other", label: "Other" },
];

export interface BlockedSender {
  conversationId: string;
  channel: string;
  updatedAt: string;
  reason: BlockReason | string;
  blockedBy: string;
}

export interface BlockedSendersResponse {
  conversations: BlockedSender[];
}

export interface AutoBlockSettings {
  enabled: boolean;
  zero_tolerance: {
    hate_speech: boolean;
    severe_insult: boolean;
    threat: boolean;
    sexual_harassment: boolean;
    fraud_scam: boolean;
    severe_abuse: boolean;
  };
  repeated_profanity: {
    enabled: boolean;
    threshold: 2 | 3 | 5;
    warn_before_block: boolean;
    warning_message: string;
    window_hours: number;
  };
  final_block_notice_enabled: boolean;
  admin_override?: boolean;
}

export interface IgnoredContact {
  id: number;
  name: string;
  phone: string;
  phoneNormalized: string;
  email: string;
  emailNormalized: string;
  channel: string;
  externalSenderId: string;
  label: string;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IgnoredContactPayload {
  name?: string;
  phone?: string;
  email?: string;
  channel?: string;
  external_sender_id?: string;
  label?: string;
  note?: string;
}

export interface IgnoredContactsResponse {
  contacts: IgnoredContact[];
}

export interface IgnoredContactImportPreviewContact {
  clientId: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  email: string;
  emailNormalized: string;
  channel: string;
  externalSenderId: string;
  label: string;
  note: string;
  valid: boolean;
  duplicate: boolean;
  alreadyIgnored: boolean;
  selected: boolean;
  errors: string[];
}

export interface IgnoredContactImportPreview {
  summary: {
    total: number;
    valid: number;
    duplicates: number;
    invalid: number;
    alreadyIgnored: number;
    toAdd: number;
    skipped: number;
  };
  contacts: IgnoredContactImportPreviewContact[];
}

export interface BlockConversationPayload {
  reason: BlockReason;
  blocked_by: string;
}

export interface BlockConversationResponse {
  ok: boolean;
  conversationId: string;
  blocked: true;
  reason: string;
  blockedBy: string;
}

export async function blockConversation(
  conversationId: string,
  payload: BlockConversationPayload,
): Promise<BlockConversationResponse> {
  const enc = encodeConversationKey(conversationId);
  const raw = await apiFetch<unknown>(`/messages/conversations/${enc}/block`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    ok: o.ok === true,
    conversationId:
      pickStr(o, "conversationId", "conversation_id") ?? conversationId,
    blocked: true,
    reason: pickStr(o, "reason") ?? payload.reason,
    blockedBy: pickStr(o, "blockedBy", "blocked_by") ?? payload.blocked_by,
  };
}

export async function unblockConversation(
  conversationId: string,
): Promise<void> {
  const enc = encodeConversationKey(conversationId);
  return apiFetch<void>(`/messages/conversations/${enc}/unblock`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Source of Truth (Your Agent knowledge)
// ---------------------------------------------------------------------------

// We import the SotBlock type only (no runtime symbols) so we don't create a
// circular runtime dependency between `lib/api.ts` and `data/sot.ts` —
// `data/sot.ts` calls these two functions; `import type` is erased at build
// time so the cycle is purely structural and TypeScript handles it cleanly.
import type { SotBlock } from "@/data/sot";

/**
 * GET /source-of-truth — canonical knowledge for this workspace.
 *
 * Tolerant decoder: accepts the contracted `{ blocks: SotBlock[] }` shape,
 * a bare array (in case the backend skips the wrapper), or an empty body.
 * Returning `[]` on an unrecognised shape keeps a fresh tenant blank
 * instead of leaking another tenant's knowledge.
 */
export async function fetchSourceOfTruth(): Promise<SotBlock[]> {
  const raw = await apiFetch<unknown>("/source-of-truth");
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { blocks?: unknown }).blocks)
  ) {
    return (raw as { blocks: SotBlock[] }).blocks;
  }
  if (Array.isArray(raw)) return raw as SotBlock[];
  return [];
}

/**
 * PUT /source-of-truth — replace the full blocks list. The backend
 * response is the new canonical value (it may have normalised / trimmed
 * fields the FE didn't), so we hand it back to the caller verbatim and
 * the React Query cache adopts it.
 *
 * If the response is malformed we fall back to the array we just sent
 * so the UI doesn't lose the operator's edit on a successful 200.
 */
export async function saveSourceOfTruth(
  blocks: SotBlock[],
): Promise<SotBlock[]> {
  const raw = await apiFetch<unknown>("/source-of-truth", {
    method: "PUT",
    body: JSON.stringify({ blocks }),
  });
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { blocks?: unknown }).blocks)
  ) {
    return (raw as { blocks: SotBlock[] }).blocks;
  }
  if (Array.isArray(raw)) return raw as SotBlock[];
  return blocks;
}

export async function fetchBlockedSenders(): Promise<BlockedSendersResponse> {
  const raw = await apiFetch<unknown>("/blocked-senders");
  return { conversations: normalizeBlockedSenders(raw) };
}

function normalizeIgnoredContact(raw: unknown): IgnoredContact | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const idRaw = o.id;
  const id = typeof idRaw === "number" ? idRaw : Number(idRaw);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    name: pickStr(o, "name") ?? "",
    phone: pickStr(o, "phone", "phone_original") ?? "",
    phoneNormalized: pickStr(o, "phoneNormalized", "phone_normalized") ?? "",
    email: pickStr(o, "email", "email_original") ?? "",
    emailNormalized: pickStr(o, "emailNormalized", "email_normalized") ?? "",
    channel: pickStr(o, "channel") ?? "",
    externalSenderId:
      pickStr(o, "externalSenderId", "external_sender_id") ?? "",
    label: pickStr(o, "label") ?? "",
    note: pickStr(o, "note") ?? "",
    createdBy: pickStr(o, "createdBy", "created_by") ?? "",
    createdAt: pickStr(o, "createdAt", "created_at") ?? "",
    updatedAt: pickStr(o, "updatedAt", "updated_at") ?? "",
  };
}

function normalizeImportPreview(raw: unknown): IgnoredContactImportPreview {
  const fallback: IgnoredContactImportPreview = {
    summary: {
      total: 0,
      valid: 0,
      duplicates: 0,
      invalid: 0,
      alreadyIgnored: 0,
      toAdd: 0,
      skipped: 0,
    },
    contacts: [],
  };
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const s = (
    r.summary && typeof r.summary === "object" ? r.summary : {}
  ) as Record<string, unknown>;
  const contactsRaw = Array.isArray(r.contacts) ? r.contacts : [];
  return {
    summary: {
      total: Number(s.total ?? 0),
      valid: Number(s.valid ?? 0),
      duplicates: Number(s.duplicates ?? 0),
      invalid: Number(s.invalid ?? 0),
      alreadyIgnored: Number(s.alreadyIgnored ?? s.already_ignored ?? 0),
      toAdd: Number(s.toAdd ?? s.to_add ?? 0),
      skipped: Number(s.skipped ?? 0),
    },
    contacts: contactsRaw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const o = item as Record<string, unknown>;
        return {
          clientId:
            pickStr(o, "clientId", "client_id") ??
            (typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `import-${Math.random().toString(36).slice(2)}`),
          name: pickStr(o, "name") ?? "",
          phone: pickStr(o, "phone") ?? "",
          phoneNormalized:
            pickStr(o, "phoneNormalized", "phone_normalized") ?? "",
          email: pickStr(o, "email") ?? "",
          emailNormalized:
            pickStr(o, "emailNormalized", "email_normalized") ?? "",
          channel: pickStr(o, "channel") ?? "",
          externalSenderId:
            pickStr(o, "externalSenderId", "external_sender_id") ?? "",
          label: pickStr(o, "label") ?? "",
          note: pickStr(o, "note") ?? "",
          valid: o.valid === true,
          duplicate: o.duplicate === true,
          alreadyIgnored:
            o.alreadyIgnored === true || o.already_ignored === true,
          selected: o.selected === true,
          errors: Array.isArray(o.errors) ? o.errors.map(String) : [],
        } satisfies IgnoredContactImportPreviewContact;
      })
      .filter(
        (item): item is IgnoredContactImportPreviewContact => item !== null,
      ),
  };
}

export async function fetchIgnoredContacts(): Promise<IgnoredContactsResponse> {
  const raw = await apiFetch<unknown>("/ignored-contacts");
  const items =
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { contacts?: unknown }).contacts)
      ? (raw as { contacts: unknown[] }).contacts
      : [];
  return {
    contacts: items
      .map(normalizeIgnoredContact)
      .filter((x): x is IgnoredContact => x !== null),
  };
}

export async function addIgnoredContact(
  payload: IgnoredContactPayload,
): Promise<IgnoredContact> {
  const raw = await apiFetch<unknown>("/ignored-contacts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const contact = normalizeIgnoredContact(
    (raw as { contact?: unknown })?.contact,
  );
  if (!contact) throw new ApiError(500, "Invalid ignored contact response");
  return contact;
}

export async function updateIgnoredContact(
  id: number,
  payload: IgnoredContactPayload,
): Promise<IgnoredContact> {
  const raw = await apiFetch<unknown>(`/ignored-contacts/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  const contact = normalizeIgnoredContact(
    (raw as { contact?: unknown })?.contact,
  );
  if (!contact) throw new ApiError(500, "Invalid ignored contact response");
  return contact;
}

export async function deleteIgnoredContact(id: number): Promise<void> {
  return apiFetch<void>(`/ignored-contacts/${id}`, { method: "DELETE" });
}

export async function validateIgnoredContactsImport(
  file: File,
): Promise<IgnoredContactImportPreview> {
  const form = new FormData();
  form.append("file", file);
  const raw = await apiFetch<unknown>("/ignored-contacts/import/validate", {
    method: "POST",
    body: form,
  });
  return normalizeImportPreview(raw);
}

export async function importIgnoredContacts(
  contacts: IgnoredContactImportPreviewContact[],
): Promise<{ added: IgnoredContact[]; skipped: unknown[] }> {
  const raw = await apiFetch<unknown>("/ignored-contacts/import", {
    method: "POST",
    body: JSON.stringify({
      contacts: contacts.map((c) => ({
        name: c.name,
        phone: c.phone,
        email: c.email,
        channel: c.channel,
        external_sender_id: c.externalSenderId,
        label: c.label,
        note: c.note,
      })),
    }),
  });
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const added = Array.isArray(r.added)
    ? r.added
        .map(normalizeIgnoredContact)
        .filter((x): x is IgnoredContact => x !== null)
    : [];
  return { added, skipped: Array.isArray(r.skipped) ? r.skipped : [] };
}

export async function fetchAutoBlockSettings(): Promise<AutoBlockSettings> {
  return apiFetch<AutoBlockSettings>("/settings/auto-block");
}

export async function saveAutoBlockSettings(
  settings: AutoBlockSettings,
): Promise<AutoBlockSettings> {
  return apiFetch<AutoBlockSettings>("/settings/auto-block", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

function normalizeBlockedSenders(raw: unknown): BlockedSender[] {
  let items: unknown[] = [];
  if (Array.isArray(raw)) items = raw;
  else if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const maybe = r.conversations ?? r.items ?? r.blocked;
    if (Array.isArray(maybe)) items = maybe;
  }
  const out: BlockedSender[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const conversationId = pickStr(
      o,
      "conversationId",
      "conversation_id",
      "phone",
      "id",
    );
    if (!conversationId) continue;
    out.push({
      conversationId,
      channel: (pickStr(o, "channel", "platform") ?? "unknown").toLowerCase(),
      updatedAt:
        pickStr(o, "updatedAt", "updated_at", "blockedAt", "blocked_at") ?? "",
      reason: (pickStr(o, "reason") ?? "other") as BlockReason | string,
      blockedBy: pickStr(o, "blockedBy", "blocked_by") ?? "",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Confirm appointment
// ---------------------------------------------------------------------------
//
// Backend contract (issue unboks-org/unboks-dashboard-api#1):
//   POST /dashboard/api/appointments/{appointment_id}/confirm
//   Auth: Bearer (existing dashboard auth)
//   Body (optional): { confirmedBy?: string, note?: string }
//   200: { id, status: "confirmed", confirmedAt, alreadyConfirmed: boolean }
//   404: { detail: "appointment not found" }
//
// Confirm is final operator confirmation — the backend fans out alerts
// (email / alt email / WhatsApp via Zernio / Telegram or Messenger when
// configured), so the UI guards the action behind a confirmation
// dialog and surfaces the `alreadyConfirmed` flag distinctly.

export interface ConfirmAppointmentPayload {
  confirmedBy?: string;
  note?: string;
}

export interface ConfirmAppointmentResponse {
  id: string;
  status: string;
  confirmedAt: string | null;
  alreadyConfirmed: boolean;
}

export async function confirmAppointment(
  appointmentId: string,
  payload: ConfirmAppointmentPayload = {},
): Promise<ConfirmAppointmentResponse> {
  const id = (appointmentId ?? "").toString().trim();
  if (!id) {
    throw new ApiError(400, "Appointment id is missing.");
  }
  // The issue documents the endpoint as
  //   POST /dashboard/api/appointments/{appointment_id}/confirm
  // but `getApiBase()` already returns `<host>/api/<slug>/dashboard/api`
  // (see lib/tenant.ts), so we pass only the suffix here. The composed
  // request URL ends up as
  //   <host>/api/<slug>/dashboard/api/appointments/<id>/confirm
  // — exactly the documented path under the per-tenant slug routing
  // every other dashboard endpoint already uses.
  const raw = await apiFetch<unknown>(
    `/appointments/${encodeURIComponent(id)}/confirm`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  const o = (
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  ) as Record<string, unknown>;
  return {
    id: pickStr(o, "id", "_id", "appointmentId") ?? id,
    status: pickStr(o, "status") ?? "confirmed",
    confirmedAt: pickStr(o, "confirmedAt", "confirmed_at"),
    alreadyConfirmed:
      o.alreadyConfirmed === true || o.already_confirmed === true,
  };
}

function normalizeAppointmentList(raw: unknown): Appointment[] {
  // Accept both `[ ... ]` and `{ items: [...] }` envelope shapes.
  let items: unknown[] = [];
  if (Array.isArray(raw)) items = raw;
  else if (raw && typeof raw === "object") {
    const maybe =
      (raw as Record<string, unknown>).items ??
      (raw as Record<string, unknown>).appointments;
    if (Array.isArray(maybe)) items = maybe;
  }
  const out: Appointment[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const id = pickStr(o, "id", "_id", "appointmentId");
    const customerName = pickStr(o, "customerName", "customer_name", "name");
    const channel = pickStr(o, "channel", "platform") ?? "unknown";
    const conversationId =
      pickStr(o, "conversationId", "conversation_id", "phone") ?? "";
    const title = pickStr(o, "title", "topic", "subject") ?? "Appointment";
    const dateTimeLabel =
      pickStr(o, "dateTimeLabel", "date_time_label", "when", "date", "time") ??
      "";
    const location = pickStr(o, "location", "place");
    const statusRaw = (pickStr(o, "status") ?? "").toLowerCase();
    const status: AppointmentStatus =
      statusRaw === "confirmed" ||
      statusRaw === "pending" ||
      statusRaw === "detected"
        ? statusRaw
        : "confirmed";
    const createdAt =
      pickStr(o, "createdAt", "created_at") ?? new Date().toISOString();
    if (!id || !customerName || !dateTimeLabel || !conversationId) continue;
    out.push({
      id,
      customerName,
      channel: channel.toLowerCase(),
      conversationId,
      title,
      dateTimeLabel,
      location: location ?? null,
      status,
      source: "backend",
      createdAt,
    });
  }
  return out;
}

function normalizeOrderList(raw: unknown): Appointment[] {
  let items: unknown[] = [];
  if (Array.isArray(raw)) items = raw;
  else if (raw && typeof raw === "object") {
    const maybe =
      (raw as Record<string, unknown>).items ??
      (raw as Record<string, unknown>).orders;
    if (Array.isArray(maybe)) items = maybe;
  }
  const out: Appointment[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const conversationId =
      pickStr(o, "conversation_id", "conversationId", "phone") ?? "";
    if (!conversationId) continue;
    const payload = normalizeOrderPayload(
      (o.order_payload ?? o.orderPayload ?? {}) as Record<string, unknown>,
      pickStr(o, "customer_name", "customerName", "name") ?? conversationId,
      conversationId,
    );
    const orderStatus = normalizeOrderStatus(
      pickStr(o, "order_status", "orderStatus", "status"),
    );
    if (!orderStatus || orderStatus === "collecting_details") continue;
    const customerName =
      payload.customerName ||
      pickStr(o, "customer_name", "customerName", "name") ||
      conversationId;
    const createdAt =
      pickStr(o, "updated_at", "updatedAt", "created_at", "createdAt") ??
      new Date().toISOString();
    const escalationId = pickId(o, "escalation_id", "escalationId");
    const orderSummary = orderLineSummary(payload);
    out.push({
      id: escalationId
        ? `order-escalation:${escalationId}`
        : `order-state:${conversationId}`,
      customerName,
      channel: (
        pickStr(o, "channel", "platform") ??
        payload.channel ??
        "whatsapp"
      ).toLowerCase(),
      conversationId,
      title: orderSummary || "Order",
      dateTimeLabel: formatOrderStatusLabel(orderStatus, payload),
      location: payload.address || null,
      status: "pending",
      source: escalationId ? "order_escalation" : "order_state",
      createdAt,
      order: payload,
      orderStatus,
      humanActionRequired: Boolean(
        o.human_action_required ?? o.humanActionRequired,
      ),
      nextOperatorAction:
        pickStr(o, "next_operator_action", "nextOperatorAction") ??
        defaultOrderNextAction(orderStatus),
      escalationId,
    });
  }
  out.sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
  );
  return out;
}

function normalizeOrderStatus(value: string | null): OrderQueueStatus | null {
  const s = (value ?? "").trim().toLowerCase();
  if (
    s === "collecting_details" ||
    s === "awaiting_customer_confirmation" ||
    s === "awaiting_human_confirmation" ||
    s === "confirmed" ||
    s === "rejected" ||
    s === "resolved"
  ) {
    return s;
  }
  return null;
}

function orderLineSummary(order: OrderDetails): string {
  return order.products
    .map((line) => {
      const qty = line.quantity != null ? `${line.quantity}x ` : "";
      return `${qty}${line.name}`.trim();
    })
    .filter(Boolean)
    .join(", ");
}

function formatOrderStatusLabel(
  status: OrderQueueStatus,
  order: OrderDetails,
): string {
  const total = formatOrderTotal(order);
  if (status === "awaiting_customer_confirmation")
    return `${total} · Awaiting customer confirmation`;
  if (status === "awaiting_human_confirmation")
    return `${total} · Needs phone confirmation`;
  if (status === "confirmed") return `${total} · Phone confirmed`;
  return total;
}

function defaultOrderNextAction(status: OrderQueueStatus): string {
  if (status === "awaiting_customer_confirmation")
    return "Waiting for the customer to confirm the order summary.";
  if (status === "awaiting_human_confirmation")
    return "Call the customer to confirm order details and delivery.";
  if (status === "confirmed")
    return "Prepare, deliver, and mark this order fulfilled.";
  return "Review this order.";
}

function normalizeOrderPayload(
  payload: Record<string, unknown>,
  fallbackName: string,
  fallbackPhone: string,
): OrderDetails {
  const productsRaw = Array.isArray(payload.products) ? payload.products : [];
  const products: OrderLine[] = [];
  for (const item of productsRaw) {
    if (!item || typeof item !== "object") continue;
    const line = item as Record<string, unknown>;
    const name = pickStr(line, "name", "product", "title");
    if (!name) continue;
    products.push({
      name,
      quantity: pickNum(line, "quantity", "qty"),
      unitPrice: pickNum(line, "unit_price", "unitPrice", "price"),
      subtotal: pickNum(line, "subtotal", "line_total", "lineTotal"),
    });
  }
  return {
    customerName:
      pickStr(payload, "customer_name", "customerName", "name") ?? fallbackName,
    phone: normalizeOrderPhone(
      pickStr(payload, "phone", "customer_phone", "customerPhone") ??
        fallbackPhone,
    ),
    address:
      pickStr(payload, "delivery_address", "deliveryAddress", "address") ?? "",
    products,
    productTotal: pickNum(payload, "product_total", "productTotal"),
    deliveryCost: pickNum(payload, "delivery_cost", "deliveryCost"),
    total: pickNum(payload, "total", "order_total", "orderTotal"),
    currency: pickStr(payload, "currency") ?? "XCG",
    comments: pickStr(
      payload,
      "comments",
      "special_requests",
      "specialRequests",
    ),
  };
}

function normalizeOrderPhone(value: string | null): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/[^\d+]/g, "");
  const digitCount = raw.replace(/\D/g, "").length;
  const looksLikeProviderObjectId =
    /^[a-f0-9]{20,32}$/i.test(raw) && digitCount < 10;
  if (looksLikeProviderObjectId) return "";
  if (digitCount < 7) return "";
  return digits || raw;
}

function pickNum(o: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v)))
      return Number(v);
  }
  return null;
}

function pickId(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function formatOrderTotal(order: OrderDetails): string {
  if (order.total == null) return "Price not captured";
  const display = Number.isInteger(order.total)
    ? String(order.total)
    : order.total.toFixed(2);
  return `${order.currency ? `${order.currency} ` : ""}${display}`;
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

export interface AccountSettingsApiResponse {
  name?: string | null;
  email?: string | null;
  support_email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
}

export interface AccountSettingsApiPayload {
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
}

export interface AgentNameSettings {
  defaultName: string;
  tenantValue: string;
  adminOverride: string | null;
  effectiveName: string;
  source: "default" | "tenant" | "admin_override" | string;
}

export interface ResponseTimingValue {
  message_batching_enabled: boolean;
  mode?: "preset" | "custom" | "random" | string;
  preset: "fast" | "balanced" | "patient" | string;
  delay_seconds: number;
  max_wait_seconds: number;
  custom_delay_seconds?: number;
  random_min_seconds?: number;
  random_max_seconds?: number;
  random_picked_seconds?: number;
  source?: string;
}

export interface ResponseTimingSettings {
  default: ResponseTimingValue;
  tenantValue: ResponseTimingValue;
  adminOverride: ResponseTimingValue | null;
  effective: ResponseTimingValue;
  source: "tenant" | "admin_override" | string;
  presets: Array<{ key: string; label: string; delay_seconds: number }>;
}

export interface WorkspaceLabelsSettings {
  bookingsLabel: string;
  defaultBookingsLabel: string;
  presets: string[];
}

export interface InfoUpdateApiItem {
  id: number | string;
  type?: string | null;
  text?: string | null;
  active?: boolean | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface InfoUpdatesApiResponse {
  updates?: InfoUpdateApiItem[];
}

export interface InfoUpdateCreatePayload {
  text: string;
  type: string;
  active?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export interface InfoUpdateUpdatePayload {
  text?: string;
  type?: string;
  active?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export interface InfoUpdateImprovePayload {
  text: string;
  type: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface InfoUpdateImproveResponse {
  originalScore: number;
  improvedScore: number;
  improvedText: string;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

let _onUnauthorized: (() => void) | null = null;
let _authFailureTenant: string | null = null;

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
function handleAuthFailure(expectedTenant: string) {
  // A late 401 from an unmounted tenant must never sign the current tenant
  // out. The request scope is immutable, so this comparison is safe.
  if (getClientSlug() !== expectedTenant) {
    console.info("[tenant-security] stale_auth_failure_discarded", {
      expectedTenant,
      activeTenant: getClientSlug(),
    });
    return;
  }
  if (_authFailureTenant === expectedTenant) return;
  _authFailureTenant = expectedTenant;
  clearAuth(expectedTenant);
  _onUnauthorized?.();
}

function endpointClass(path: string): string {
  return path.split("?")[0].split("/").filter(Boolean)[0] ?? "root";
}

function responseTenantIdentity(
  res: Response,
  body: unknown,
  path: string,
): string | null {
  const header = res.headers.get("X-Unboks-Tenant");
  if (header) {
    // Fetch combines repeated response headers with commas. Treat repeated,
    // identical tenant values as one identity, while leaving mixed values
    // intact so the strict comparison below rejects the response.
    const identities = header
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      identities.length > 0 &&
      identities.every((value) => value === identities[0])
    ) {
      return identities[0];
    }
    return header;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const root = body as Record<string, unknown>;
  const keys = path.startsWith("/client/profile")
    ? ["tenantSlug", "tenant_slug", "tenant", "slug"]
    : ["tenantSlug", "tenant_slug", "tenant"];
  for (const key of keys) {
    const value = root[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function assertResponseTenant(
  res: Response,
  body: unknown,
  expectedTenant: string,
  path: string,
  requireIdentity = false,
): void {
  const actualTenant = responseTenantIdentity(res, body, path);
  if (!actualTenant && !requireIdentity) return;
  if (actualTenant === expectedTenant) return;
  console.error("[tenant-security] response_tenant_mismatch", {
    expectedTenant,
    actualTenant,
    endpointClass: endpointClass(path),
    status: res.status,
  });
  throw new ApiError(409, "Workspace response rejected");
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  skipAuth = false,
  requireTenantIdentity = false,
): Promise<T> {
  const { tenantSlug, token } = captureTenantRequestScope();
  const base = getApiBase(tenantSlug);

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  const hasContentType = Object.keys(headers).some(
    (k) => k.toLowerCase() === "content-type",
  );
  if (!(options.body instanceof FormData) && !hasContentType) {
    headers["Content-Type"] = "application/json";
  }

  if (!skipAuth && token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...options, headers });
  } catch (networkErr) {
    // Network failure / CORS / DNS / offline — keep the user logged in.
    // Surface as ApiError(0) so callers can distinguish from auth errors.
    throw new ApiError(
      0,
      networkErr instanceof Error ? networkErr.message : "Network error",
    );
  }

  // Only treat as an auth failure if the request actually sent a token.
  // Unauthenticated requests (e.g., login) returning 401 are not a session expiry.
  if ((res.status === 401 || res.status === 403) && !skipAuth && token) {
    handleAuthFailure(tenantSlug);
    throw new ApiError(
      res.status,
      res.status === 401 ? "Unauthorized" : "Forbidden",
    );
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let details: unknown;
    try {
      const body = await res.json();
      details = body;
      // `body.detail` is what the new escalation-learning endpoints
      // (Claudia #32) return for human-friendly errors. Other endpoints
      // continue to use `message` / `error`. Order: message > error >
      // detail so we don't regress existing behaviour.
      const candidate = body.message ?? body.error ?? body.detail;
      if (typeof candidate === "string") msg = candidate;
      else if (candidate && typeof candidate === "object") {
        const code = (candidate as Record<string, unknown>).code;
        if (typeof code === "string") msg = code;
      }
    } catch {
      // ignore
    }
    throw new ApiError(res.status, msg, details);
  }
  if (res.status === 204) {
    assertResponseTenant(
      res,
      undefined,
      tenantSlug,
      path,
      requireTenantIdentity,
    );
    return undefined as T;
  }
  const body = (await res.json()) as T;
  assertResponseTenant(res, body, tenantSlug, path, requireTenantIdentity);
  return body;
}

// ---------------------------------------------------------------------------
// Client profile (workspace display name + status)
// ---------------------------------------------------------------------------
//
// J3-N2-15: render the tenant's business name in the sidebar so a new
// operator opening a fresh dashboard sees "Pepe Test" / "Acme Corp" — not
// the generic "Connected to Unboks" badge. The backend is expected to
// expose `GET /client/profile` returning
//
//   { slug: string; name: string; business_name?: string; status?: string }
//
// where `business_name` is the brand name from `client.json` and `name` is
// either the same value or the slug used to look the tenant up. If the
// endpoint is missing we degrade gracefully to a slug-derived display
// name so the dashboard ships the visual improvement TODAY, ahead of the
// backend change. No fake placeholder data: the slug is what the operator
// typed at login, so showing it title-cased is honest.

export interface ClientProfile {
  slug: string;
  name: string;
  status: "active" | "trial" | "suspended" | "unknown";
}

export interface AgentStatus {
  active: boolean | null;
  status: "active" | "paused" | "unavailable";
  available: boolean;
  source: string;
  updatedAt: string | null;
}

export async function getAgentStatus(): Promise<AgentStatus> {
  return apiFetch<AgentStatus>("/agent/status", {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
}

export async function setAgentStatus(active: boolean): Promise<AgentStatus> {
  return apiFetch<AgentStatus>("/agent/status", {
    method: "PUT",
    body: JSON.stringify({ active }),
  });
}

function prettifySlug(slug: string): string {
  if (!slug) return "";
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) =>
      part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part,
    )
    .join(" ");
}

function normalizeClientProfile(raw: unknown, slug: string): ClientProfile {
  const fallback: ClientProfile = {
    slug,
    name: prettifySlug(slug),
    status: "unknown",
  };
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const business =
    typeof r.business === "object" && r.business
      ? (r.business as Record<string, unknown>)
      : null;
  const candidates: unknown[] = [
    business?.name,
    business?.display_name,
    r.business_name,
    r.display_name,
    r.name,
  ];
  const name = candidates.find(
    (v) => typeof v === "string" && v.trim().length > 0,
  ) as string | undefined;
  const rawStatus = typeof r.status === "string" ? r.status.toLowerCase() : "";
  const status: ClientProfile["status"] =
    rawStatus === "active" || rawStatus === "trial" || rawStatus === "suspended"
      ? rawStatus
      : "unknown";
  return {
    slug,
    name: name && name.trim().length > 0 ? name.trim() : fallback.name,
    status,
  };
}

export async function getClientProfile(): Promise<ClientProfile> {
  const slug = getClientSlug();
  try {
    const raw = await apiFetch<unknown>("/client/profile");
    return normalizeClientProfile(raw, slug);
  } catch (err) {
    // Two cases that justify a silent fallback to the slug-derived name:
    //   1. Endpoint missing (404) — backend hasn't shipped /client/profile yet.
    //   2. Network failure (ApiError status 0) — the operator is offline /
    //      CORS preflight failed / DNS broke. Showing the slug is honest
    //      and the rest of the dashboard will surface the network problem
    //      via its own queries.
    // Everything else (401/403 auth, 5xx server, malformed JSON, etc.)
    // must propagate so a real server regression doesn't get masked by
    // a permanently happy-looking sidebar.
    if (err instanceof ApiError && (err.status === 404 || err.status === 0)) {
      return {
        slug,
        name: prettifySlug(slug),
        status: "unknown",
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function apiLogin(
  password: string,
  slug?: string,
): Promise<LoginResponse> {
  // J3-N2-10: callers may pass an explicit slug so the URL targets the
  // intended tenant WITHOUT persisting it to localStorage first. The
  // persistence invariant (slug + token are only written after the
  // backend confirms credentials) lives in AuthProvider.login. When no
  // slug is provided we fall back to the currently persisted client.
  const base = slug ? getApiBase(slug) : getApiBase();
  let res: Response;
  try {
    res = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch (networkErr) {
    throw new ApiError(
      0,
      networkErr instanceof Error ? networkErr.message : "Network error",
    );
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.message ?? body.error ?? body.detail ?? msg;
    } catch {
      // ignore body parse failure — fall through with the status code message
    }
    throw new ApiError(res.status, msg);
  }
  const expectedTenant = slug ?? getClientSlug();
  const responseTenant = res.headers.get("X-Unboks-Tenant");
  if (responseTenant && responseTenant !== expectedTenant) {
    console.error("[tenant-security] response_tenant_mismatch", {
      expectedTenant,
      actualTenant: responseTenant,
      endpointClass: "login",
      status: res.status,
    });
    throw new ApiError(409, "Workspace response rejected");
  }
  // A successful login starts a fresh session — re-arm the auth-failure latch
  _authFailureTenant = null;
  return (await res.json()) as LoginResponse;
}

export async function fetchAccountSettings(): Promise<AccountSettingsApiResponse> {
  return apiFetch<AccountSettingsApiResponse>("/settings/your-info");
}

export async function saveAccountSettings(
  payload: AccountSettingsApiPayload,
): Promise<AccountSettingsApiResponse> {
  return apiFetch<AccountSettingsApiResponse>("/settings/your-info", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchAgentNameSettings(): Promise<AgentNameSettings> {
  return apiFetch<AgentNameSettings>("/settings/agent-name");
}

export async function saveAgentNameSettings(
  agentName: string,
): Promise<AgentNameSettings> {
  return apiFetch<AgentNameSettings>("/settings/agent-name", {
    method: "PUT",
    body: JSON.stringify({ agent_name: agentName }),
  });
}

export async function fetchResponseTimingSettings(): Promise<ResponseTimingSettings> {
  return apiFetch<ResponseTimingSettings>("/settings/response-timing");
}

export async function saveResponseTimingSettings(
  value: ResponseTimingValue,
): Promise<ResponseTimingSettings> {
  return apiFetch<ResponseTimingSettings>("/settings/response-timing", {
    method: "PUT",
    body: JSON.stringify(value),
  });
}

export async function fetchWorkspaceLabelsSettings(): Promise<WorkspaceLabelsSettings> {
  return apiFetch<WorkspaceLabelsSettings>("/settings/workspace-labels");
}

export async function saveWorkspaceLabelsSettings(
  bookingsLabel: string,
): Promise<WorkspaceLabelsSettings> {
  return apiFetch<WorkspaceLabelsSettings>("/settings/workspace-labels", {
    method: "PUT",
    body: JSON.stringify({ bookings_label: bookingsLabel }),
  });
}

function normalizeProductSettings(raw: unknown): ProductSettings {
  const fallback: ProductSettings = {
    deliveryCostAmount: null,
    deliveryCostCurrency: "XCG",
  };
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const amount = pickNum(r, "delivery_cost_amount", "deliveryCostAmount");
  return {
    deliveryCostAmount: amount,
    deliveryCostCurrency:
      pickStr(
        r,
        "delivery_cost_currency",
        "deliveryCostCurrency",
        "currency",
      ) ?? fallback.deliveryCostCurrency,
  };
}

export async function fetchProductSettings(): Promise<ProductSettings> {
  const raw = await apiFetch<unknown>("/settings/product-settings");
  return normalizeProductSettings(raw);
}

export async function saveProductSettings(
  payload: ProductSettings,
): Promise<ProductSettings> {
  const raw = await apiFetch<unknown>("/settings/product-settings", {
    method: "PUT",
    body: JSON.stringify({
      delivery_cost_amount: payload.deliveryCostAmount,
      delivery_cost_currency: payload.deliveryCostCurrency,
    }),
  });
  return normalizeProductSettings(raw);
}

export async function fetchInfoUpdates(): Promise<InfoUpdatesApiResponse> {
  return apiFetch<InfoUpdatesApiResponse>("/settings/info-updates");
}

export async function improveInfoUpdateInstruction(
  payload: InfoUpdateImprovePayload,
): Promise<InfoUpdateImproveResponse> {
  return apiFetch<InfoUpdateImproveResponse>("/settings/info-updates/improve", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createInfoUpdate(
  payload: InfoUpdateCreatePayload,
): Promise<{ ok: boolean; id: number | string }> {
  return apiFetch<{ ok: boolean; id: number | string }>(
    "/settings/info-updates",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function setInfoUpdateActive(
  id: string,
  active: boolean,
): Promise<void> {
  await apiFetch(`/settings/info-updates/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ active }),
  });
}

export async function updateInfoUpdate(
  id: string,
  payload: InfoUpdateUpdatePayload,
): Promise<void> {
  await apiFetch(`/settings/info-updates/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteInfoUpdate(id: string): Promise<void> {
  await apiFetch(`/settings/info-updates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Conversations (Inbox)
// ---------------------------------------------------------------------------

export async function fetchConversations(): Promise<ApiConversation[]> {
  return apiFetch<ApiConversation[]>("/messages/conversations");
}

export async function fetchArchivedConversations(): Promise<ApiConversation[]> {
  return apiFetch<ApiConversation[]>("/messages/conversations/archived");
}

export async function archiveConversation(
  conversationId: string,
): Promise<void> {
  return apiFetch<void>(
    `/messages/conversations/${encodeConversationKey(conversationId)}/archive`,
    { method: "POST" },
  );
}

export async function unarchiveConversation(
  conversationId: string,
): Promise<void> {
  return apiFetch<void>(
    `/messages/conversations/${encodeConversationKey(conversationId)}/unarchive`,
    { method: "POST" },
  );
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

/**
 * Normalize a single raw message from the backend into the strict
 * `ApiMessage` shape used by the UI. The Python backend has shipped several
 * message shapes over time and the email pipeline in particular returns
 * objects whose body field is `text` / `body` / `message` rather than
 * `content`, plus `created_at` instead of `timestamp`. Without this mapping
 * the detail pane rendered empty bubbles for every email message because
 * `msg.content` resolved to undefined.
 *
 * Field priority follows the backend's documented + observed shapes; first
 * non-empty wins. Role is mapped from `role` / `direction` / `sender` /
 * `from`, with `incoming|inbound|customer|user` → `user` and everything
 * else (`outgoing|outbound|assistant|agent|bot|ai`) → `assistant`.
 */
function pickStr(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function normalizeMessage(raw: unknown, idx: number): ApiMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const content =
    pickStr(o, "text", "content", "body", "message", "snippet") ?? "";
  // Drop messages with no body — they'd render as empty bubbles otherwise.
  // (e.g. system pings, attachment-only rows we don't yet preview.)
  if (!content) return null;

  const roleRaw = (
    pickStr(o, "role", "direction", "sender", "from", "author") ?? ""
  ).toLowerCase();
  // Three-way role mapping:
  //   - inbound / customer-side strings → "user"
  //   - human-team strings              → "operator"
  //   - everything else (incl. "agent", "marina", "ai", "bot",
  //     "outbound") → "assistant" (Marina, the AI)
  // Order matters: check operator BEFORE the catch-all assistant.
  const role: "user" | "assistant" | "operator" =
    /^(incoming|inbound|in|customer|user|client|contact)$/.test(roleRaw)
      ? "user"
      : /^(operator|staff|team|teammate|human|admin|support|takeover|human_reply|team_reply|from_team|outbound_human|manual_reply)$/.test(
            roleRaw,
          )
        ? "operator"
        : "assistant";

  const timestampRaw = pickStr(
    o,
    "timestamp",
    "created_at",
    "createdAt",
    "sent_at",
    "sentAt",
    "date",
    "time",
  );
  const timestamp = timestampRaw
    ? formatConversationTimestamp(timestampRaw)
    : "";
  // parseTimestampMs handles ISO 8601 including Python microsecond format
  // (`2026-05-05T20:06:19.000326+00:00`) and rejects display-only labels
  // like "9:42 AM" by returning 0.
  const timestampMs = parseTimestampMs(timestampRaw);

  const id = pickStr(o, "id", "_id", "messageId", "message_id") ?? `msg-${idx}`;

  return { id, role, content, timestamp, timestampMs };
}

/** Pull the messages array from any of the shapes the backend has returned:
 *  bare array, `{ messages: [...] }`, `{ history: [...] }`, etc. */
function extractRawMessages(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const key of ["messages", "history", "thread", "items", "data"]) {
      const v = o[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export async function fetchConversation(
  phone: string,
): Promise<ConversationDetail> {
  const key = (phone ?? "").replace(/[\r\n]+/g, "").trim();
  if (!key) {
    throw new ApiError(400, "Conversation id is missing.");
  }
  // Fetch as `unknown` so we can defensively normalize both the message
  // field names and the envelope shape (bare array vs. object with
  // `messages`). Email conversations in particular return body text under
  // `text` / `body` rather than `content`, and timestamps under
  // `created_at` rather than `timestamp` — without normalization the
  // detail pane renders empty bubbles for every email.
  const raw = await apiFetch<unknown>(
    `/messages/conversations/${encodeConversationKey(key)}`,
  );

  const rawMessages = extractRawMessages(raw);
  const messages = rawMessages
    .map((m, i) => normalizeMessage(m, i))
    .filter((m): m is ApiMessage => m !== null);

  // Pull metadata from the envelope when present; otherwise fall back to
  // sensible defaults so the rest of the UI (header, escalation banner,
  // composer) keeps working even on minimal responses.
  const env = (
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  ) as Record<string, unknown>;

  // The backend returns a structured object here, not just a string. Dropping
  // it used to erase the real reason and send the UI into generic heuristics.
  const summaryValue = env.escalationSummary ?? env.escalation_summary;
  const structuredSummary =
    summaryValue &&
    typeof summaryValue === "object" &&
    !Array.isArray(summaryValue)
      ? (summaryValue as Record<string, unknown>)
      : {};

  return {
    phone: pickStr(env, "phone", "external_id", "externalId") ?? key,
    name: pickStr(env, "name", "customerName", "customer_name") ?? "",
    contactId: pickStr(env, "contactId", "contact_id"),
    platform: pickStr(env, "platform", "channel") ?? "",
    messages,
    // Accept both `escalated: true` (boolean field) and `status: "escalated"`
    // (string field used by the Python backend for email conversations).
    escalated:
      typeof env.escalated === "boolean"
        ? env.escalated
        : typeof env.status === "string" &&
            /^escalated$/i.test(env.status as string)
          ? true
          : undefined,
    escalationResolved:
      typeof env.escalationResolved === "boolean"
        ? env.escalationResolved
        : typeof env.escalation_resolved === "boolean"
          ? (env.escalation_resolved as boolean)
          : undefined,
    escalationMode: (pickStr(env, "escalationMode", "escalation_mode") ??
      null) as ConversationDetail["escalationMode"],
    escalationReason:
      pickStr(env, "escalationReason", "escalation_reason") ??
      pickStr(structuredSummary, "reason"),
    escalationSummary:
      pickStr(env, "escalationSummary", "escalation_summary") ??
      pickStr(structuredSummary, "reason", "summary"),
    customerWants:
      pickStr(env, "customerWants", "customer_wants") ??
      pickStr(structuredSummary, "customerWants", "customer_wants"),
    operatorNeedsToDecide:
      pickStr(env, "operatorNeedsToDecide", "operator_needs_to_decide") ??
      pickStr(
        structuredSummary,
        "operatorNeedsToDecide",
        "operator_needs_to_decide",
      ),
    escalationCustomerMessage: pickStr(
      structuredSummary,
      "latestCustomerMessage",
      "latest_customer_message",
    ),
    humanGuidance: pickStr(env, "humanGuidance", "human_guidance"),
    humanResponder: pickStr(env, "humanResponder", "human_responder"),
    humanRespondedAt: pickStr(env, "humanRespondedAt", "human_responded_at"),
    humanTakeoverAt: pickStr(env, "humanTakeoverAt", "human_takeover_at"),
    aiMuted:
      typeof env.aiMuted === "boolean"
        ? env.aiMuted
        : typeof env.ai_muted === "boolean"
          ? (env.ai_muted as boolean)
          : undefined,
    learningStatus: (pickStr(env, "learningStatus", "learning_status") ??
      undefined) as ConversationDetail["learningStatus"],
    recommendedOptions:
      Array.isArray(env.recommendedOptions) ||
      Array.isArray(env.recommended_options)
        ? pickStringArray(env, "recommendedOptions", "recommended_options")
        : pickStringArray(
            structuredSummary,
            "recommendedOptions",
            "recommended_options",
          ),
    extractedDetails:
      pickExtractedDetails(env) ?? pickExtractedDetails(structuredSummary),
    crewAssistance: parseMermaidCrewAssistance(
      env.crewAssistance ?? env.crew_assistance,
      "conversation",
    ),
  };
}

/**
 * Read a string array from the response envelope under any of the given
 * keys. Returns null if no key holds an array of strings, otherwise an
 * array containing every non-empty string entry in original order. We
 * NEVER slice this list — every recommended option must reach the UI
 * so the operator sees all backend recommendations as chips.
 */
function pickStringArray(
  o: Record<string, unknown>,
  ...keys: string[]
): string[] | null {
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) {
      const cleaned = v
        .filter(
          (x): x is string => typeof x === "string" && x.trim().length > 0,
        )
        .map((x) => x.trim());
      if (cleaned.length > 0) return cleaned;
    }
  }
  return null;
}

/**
 * Read structured `extractedDetails` (camelCase or snake_case) and pull
 * out `proposedTimes` (camelCase or snake_case) as a string array. The
 * full list is preserved — multiple proposed times are never collapsed
 * here, since the briefing builder turns each entry into its own chip.
 */
function pickExtractedDetails(
  o: Record<string, unknown>,
): { proposedTimes?: string[] | null } | null {
  const raw =
    (o["extractedDetails"] as unknown) ??
    (o["extracted_details"] as unknown) ??
    null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const inner = raw as Record<string, unknown>;
  const proposedTimes = pickStringArray(
    inner,
    "proposedTimes",
    "proposed_times",
  );
  if (!proposedTimes) return null;
  return { proposedTimes };
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

// ---------------------------------------------------------------------------
// Direct WhatsApp conversation reply
// ---------------------------------------------------------------------------

export interface WhatsAppConversationReplyResponse {
  ok: boolean;
  reply: string;
  channel: "whatsapp";
  role: "operator";
  delivery_mode?: "free_text" | "template";
  original_message_sent?: boolean;
}

export async function replyToWhatsAppConversation(
  conversationId: string,
  message: string,
  requestId?: string,
): Promise<WhatsAppConversationReplyResponse> {
  const key = (conversationId ?? "").replace(/[\r\n]+/g, "").trim();
  const text = message ?? "";
  if (!key) throw new ApiError(400, "Conversation id is missing.");
  if (!text.trim()) throw new ApiError(400, "Message is required.");
  if (text.length > 4096) {
    throw new ApiError(400, "WhatsApp messages cannot exceed 4096 characters.");
  }

  return withOperatorRequest(
    "inbox:reply",
    { conversation_id: key, message: text },
    (stableId) =>
      apiFetch<WhatsAppConversationReplyResponse>("/messages/whatsapp/reply", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: key,
          message: text,
          request_id: stableId,
        }),
      }),
    requestId,
  );
}

// ---------------------------------------------------------------------------
// Email actions (TASK-021 / Briefs 210 + 218)
// ---------------------------------------------------------------------------
//
// Reply / Forward / Delete for Email channel conversations. The Python
// backend exposes these under the same `/messages/conversations/:id`
// prefix as the existing detail/delete routes, so they share
// `encodeConversationKey` (email ids can contain `:` / `@` / spaces).
//
// Errors propagate as ApiError so callers can branch on `.status`:
//   0           — network / CORS — show generic retry copy
//   401 / 403   — handled globally (auth wipe + redirect)
//   404 / 501   — endpoint not deployed yet — show "not available yet"
//   400/409/500 — show backend message verbatim

export interface EmailReplyPayload {
  body: string;
  /** "direct" sends as the operator. Backend default if omitted. */
  mode?: "direct";
  attachments?: unknown[];
}

export interface EmailForwardPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  note?: string;
  includeAttachments?: boolean;
}

export interface EmailDeletePayload {
  /** "trash" = local hide. Backend may add archive/purge later. */
  deleteMode?: "trash";
}

/**
 * Send an email reply.
 *
 * Primary endpoint (the contract Jr published in Brief 210):
 *   POST /messages/conversations/{id}/email/reply
 *
 * Some live deployments responded with HTTP 405 to the `/email/reply`
 * suffix because the backend mounted the route as the channel-agnostic
 * `/reply` (the `/email/...` suffix landed only on `forward` + `delete`).
 * To unblock operators without guessing wildly we add ONE narrow
 * compatibility fallback: on 404/405 retry the bare `/reply` path. Any
 * other error bubbles up untouched. If both attempts return 404/405 we
 * surface the explicit spec copy so the operator sees a useful error
 * instead of a generic "not available yet" placeholder.
 *
 * Logged (info-level) so it's visible in browser devtools which path
 * actually carried the message.
 */
export async function replyToEmail(
  conversationId: string,
  payload: EmailReplyPayload,
): Promise<{ ok: boolean }> {
  const key = (conversationId ?? "").replace(/[\r\n]+/g, "").trim();
  if (!key) throw new ApiError(400, "Conversation id is missing.");
  const enc = encodeConversationKey(key);
  const body = JSON.stringify({
    body: payload.body,
    mode: payload.mode ?? "direct",
    attachments: payload.attachments ?? [],
  });
  const primary = `/messages/conversations/${enc}/email/reply`;
  const fallback = `/messages/conversations/${enc}/reply`;
  try {
    const result = await apiFetch<{ ok: boolean }>(primary, {
      method: "POST",
      body,
    });
    if (DEBUG_LOGS_ENABLED) debugInfo(`[unboks] email reply via ${primary}`);
    return result;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      try {
        const result = await apiFetch<{ ok: boolean }>(fallback, {
          method: "POST",
          body,
        });
        if (DEBUG_LOGS_ENABLED) {
          debugInfo(
            `[unboks] email reply via ${fallback} (fell back from ${primary} → HTTP ${err.status})`,
          );
        }
        return result;
      } catch (fallbackErr) {
        if (
          fallbackErr instanceof ApiError &&
          (fallbackErr.status === 404 || fallbackErr.status === 405)
        ) {
          throw new ApiError(
            405,
            "Email reply endpoint method mismatch. Backend returned HTTP 405.",
          );
        }
        throw fallbackErr;
      }
    }
    throw err;
  }
}

export async function forwardEmail(
  conversationId: string,
  payload: EmailForwardPayload,
): Promise<{ ok: boolean }> {
  const key = (conversationId ?? "").replace(/[\r\n]+/g, "").trim();
  if (!key) throw new ApiError(400, "Conversation id is missing.");
  return apiFetch<{ ok: boolean }>(
    `/messages/conversations/${encodeConversationKey(key)}/email/forward`,
    {
      method: "POST",
      body: JSON.stringify({
        to: payload.to,
        cc: payload.cc ?? [],
        bcc: payload.bcc ?? [],
        note: payload.note ?? "",
        includeAttachments: payload.includeAttachments ?? true,
      }),
    },
  );
}

/**
 * Delete (local hide) an email conversation. Tries DELETE first per the
 * product contract; on 404/405 (older deployments may have only the POST
 * variant) falls back to POST `/email/delete`. Any other error bubbles up.
 */
export async function deleteEmail(
  conversationId: string,
  payload: EmailDeletePayload = {},
): Promise<{ ok: boolean }> {
  const key = (conversationId ?? "").replace(/[\r\n]+/g, "").trim();
  if (!key) throw new ApiError(400, "Conversation id is missing.");
  const enc = encodeConversationKey(key);
  const deleteMode = payload.deleteMode ?? "trash";
  try {
    return await apiFetch<{ ok: boolean }>(
      `/messages/conversations/${enc}/email?deleteMode=${encodeURIComponent(deleteMode)}`,
      { method: "DELETE" },
    );
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      return apiFetch<{ ok: boolean }>(
        `/messages/conversations/${enc}/email/delete`,
        { method: "POST", body: JSON.stringify({ deleteMode }) },
      );
    }
    throw err;
  }
}

export async function suggestReply(
  phone: string,
): Promise<{ suggestion: string }> {
  return apiFetch<{ suggestion: string }>("/messages/suggest-reply", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

// ---------------------------------------------------------------------------
// Escalations
// ---------------------------------------------------------------------------

export async function fetchEscalations(
  mode?: "soft" | "hard" | "order" | "all",
): Promise<Escalation[]> {
  const qs = mode && mode !== "all" ? `?mode=${mode}` : "";
  return apiFetch<Escalation[]>(`/escalations${qs}`);
}

export async function fetchResolvedEscalations(): Promise<Escalation[]> {
  return apiFetch<Escalation[]>(`/escalations?status=resolved`);
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

export async function markOrderPhoneConfirmed(
  id: string,
): Promise<{ ok: boolean; status: "confirmed" }> {
  return apiFetch(`/orders/${id}/phone-confirmed`, {
    method: "POST",
  });
}

export async function unresolveEscalation(id: string): Promise<Escalation> {
  return apiFetch<Escalation>(`/escalations/${id}/unresolve`, {
    method: "POST",
  });
}

export async function replyEscalation(
  id: string,
  message: string,
  mediaId?: string,
  requestId?: string,
): Promise<void> {
  const payload = { message, ...(mediaId ? { mediaId } : {}) };
  return withOperatorRequest(
    `escalations:${id}:reply`,
    payload,
    (stableId) =>
      apiFetch<void>(`/escalations/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({ ...payload, request_id: stableId }),
      }),
    requestId,
  );
}

export async function deleteEscalation(id: string): Promise<void> {
  return apiFetch<void>(`/escalations/${id}`, { method: "DELETE" });
}

export async function submitGuidance(
  id: string,
  payload: GuidancePayload,
): Promise<{ ok: boolean; learningEntryId?: string | null }> {
  const { request_id, ...body } = payload;
  return withOperatorRequest(
    `escalations:${id}:guidance`,
    body,
    (stableId) =>
      apiFetch(`/escalations/${id}/guidance`, {
        method: "POST",
        body: JSON.stringify({ ...body, request_id: stableId }),
      }),
    request_id,
  );
}

export async function takeoverEscalation(
  id: string,
  note?: string,
): Promise<void> {
  return apiFetch<void>(`/escalations/${id}/takeover`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function setEscalationMode(
  id: string,
  mode: "soft" | "hard" | "order",
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
// AI Editor (Translate / Style / Fix)
// ---------------------------------------------------------------------------
//
// Frontend client only. The backend endpoint may not exist yet — callers
// must catch ApiError and treat status 0 / 404 / 501 / 503 as "not connected"
// and surface the calm copy "AI Editor will be connected by the Unboks team."
// instead of crashing or wiping the operator's draft.

export type AIEditorAction = "translate" | "style" | "fix";

export type AIEditorLanguage =
  | "English"
  | "Dutch"
  | "Spanish"
  | "Papiamento"
  | "Swedish"
  | "Portuguese";

export type AIEditorStyle =
  | "professional"
  | "warmer"
  | "shorter"
  | "friendlier"
  | "direct";

export interface AIEditorContext {
  conversationId?: string;
  escalationMode?: "soft" | "hard" | "order";
  channel?: string;
}

export interface AIEditorParams {
  action: AIEditorAction;
  text: string;
  targetLanguage?: AIEditorLanguage;
  style?: AIEditorStyle;
  context?: AIEditorContext;
}

export interface AIEditorResponse {
  text: string;
}

export async function aiEditorEdit(
  params: AIEditorParams,
): Promise<AIEditorResponse> {
  return apiFetch<AIEditorResponse>(`/ai-editor`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ---------------------------------------------------------------------------
// Message Translation (operator read-side)
// ---------------------------------------------------------------------------
//
// Distinct from AI Editor in intent: this is for the human operator to read
// an inbound (or outbound) message in English. It does NOT modify the
// conversation, does NOT send anything to the customer, and is not used by
// Marina's reply pipeline.
//
// V1 reuses the AI Editor endpoint with `action: "translate"`. Frontend
// naming is kept separate so the message bubble button can read "Translate"
// and never expose AI Editor terminology to the operator on the read side.
// If the backend later ships a dedicated `/translate` route, only this
// function changes.

export interface TranslateMessageContext {
  conversationId: string;
  messageId: string;
  channel?: string;
  /** Disambiguates from AI Editor's draft-rewrite usage on the server side. */
  usage?: "operator_message_translation";
}

export interface TranslateMessageParams {
  text: string;
  targetLanguage: AIEditorLanguage;
  context: TranslateMessageContext;
}

export interface TranslateMessageResponse {
  /** Translated text in `targetLanguage`. */
  text: string;
  /** Detected source language, when the backend provides it. */
  sourceLanguage?: string;
  targetLanguage?: AIEditorLanguage;
}

export async function translateMessage(
  params: TranslateMessageParams,
): Promise<TranslateMessageResponse> {
  const result = await aiEditorEdit({
    action: "translate",
    text: params.text,
    targetLanguage: params.targetLanguage,
    context: {
      conversationId: params.context.conversationId,
      channel: params.context.channel,
    },
  });
  return {
    text: result.text,
    targetLanguage: params.targetLanguage,
  };
}

// ---------------------------------------------------------------------------
// Learning entries
// ---------------------------------------------------------------------------

export async function fetchLearningEntries(
  status?: string,
): Promise<LearningEntry[]> {
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
// Escalation Learnings (R2-32 / R2-34, Claudia #32 backend)
// ---------------------------------------------------------------------------
//
// NEW system, deliberately separate from the legacy `/learning` endpoints
// above. The flow:
//
//   1. After the operator Sends, Send & Resolves, or Resolves an
//      escalation, the dashboard POSTs the operator's reply text to
//      `/escalations/{id}/suggest-learning` to create a "pending"
//      learning candidate.
//   2. The operator sees a SuggestedLearningCard with three actions:
//      Approve, Edit first, Do not save. Approve / Edit-then-Approve
//      promote the candidate to "approved"; Do not save dismisses it.
//   3. Pending candidates are also surfaced in the Settings page
//      (Agent learnings) so the operator can review anything they
//      skipped at composer time.
//
// Approved learnings are the only ones the Agent should ever consult.
// Pending and dismissed entries must never look like active knowledge.

export type EscalationLearningStatus = "pending" | "approved" | "dismissed";

export interface EscalationLearning {
  id: string;
  status: EscalationLearningStatus;
  suggestedText: string;
  sourceQuestion: string;
  channel: string;
  operator: string;
  createdAt: string;
  updatedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  dismissedAt?: string;
  escalationId?: string;
}

export interface SuggestEscalationLearningPayload {
  suggestedText: string;
  sourceQuestion: string;
  channel: string;
  operator: string;
}

export async function fetchEscalationLearnings(
  status?: EscalationLearningStatus,
): Promise<EscalationLearning[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<EscalationLearning[]>(`/escalation-learnings${qs}`);
}

export async function suggestEscalationLearning(
  escalationId: string,
  payload: SuggestEscalationLearningPayload,
): Promise<EscalationLearning> {
  return apiFetch<EscalationLearning>(
    `/escalations/${encodeURIComponent(escalationId)}/suggest-learning`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export async function editEscalationLearning(
  id: string,
  suggestedText: string,
): Promise<EscalationLearning> {
  return apiFetch<EscalationLearning>(
    `/escalation-learnings/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ suggestedText }) },
  );
}

export async function approveEscalationLearning(
  id: string,
  operator: string,
): Promise<EscalationLearning> {
  return apiFetch<EscalationLearning>(
    `/escalation-learnings/${encodeURIComponent(id)}/approve`,
    { method: "POST", body: JSON.stringify({ operator }) },
  );
}

export async function dismissEscalationLearning(id: string): Promise<void> {
  return apiFetch<void>(
    `/escalation-learnings/${encodeURIComponent(id)}/dismiss`,
    { method: "POST" },
  );
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

export interface OnboardingStatus {
  tenantSlug: string;
  businessName: string;
  billingStatus: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  whatsappConnected: boolean;
  whatsappConnectionStatus: string;
  whatsappConnectUrl: string;
}

export async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  const raw = await apiFetch<Partial<OnboardingStatus>>("/onboarding/status");
  return {
    tenantSlug: typeof raw.tenantSlug === "string" ? raw.tenantSlug : "",
    businessName: typeof raw.businessName === "string" ? raw.businessName : "",
    billingStatus:
      typeof raw.billingStatus === "string" ? raw.billingStatus : "",
    trialStartedAt:
      typeof raw.trialStartedAt === "string" ? raw.trialStartedAt : null,
    trialEndsAt: typeof raw.trialEndsAt === "string" ? raw.trialEndsAt : null,
    trialDaysRemaining:
      typeof raw.trialDaysRemaining === "number"
        ? raw.trialDaysRemaining
        : null,
    whatsappConnected:
      typeof raw.whatsappConnected === "boolean"
        ? raw.whatsappConnected
        : false,
    whatsappConnectionStatus:
      typeof raw.whatsappConnectionStatus === "string"
        ? raw.whatsappConnectionStatus
        : "",
    whatsappConnectUrl:
      typeof raw.whatsappConnectUrl === "string" ? raw.whatsappConnectUrl : "",
  };
}

export interface AgentPersonalitySettings {
  tone: string;
  formality: string;
  empathy: string;
  appointmentStyle: string;
  instructions: string;
  examples: string[];
}

const EMPTY_AGENT_PERSONALITY: AgentPersonalitySettings = {
  tone: "",
  formality: "",
  empathy: "",
  appointmentStyle: "",
  instructions: "",
  examples: [],
};

function normalizeAgentPersonality(raw: unknown): AgentPersonalitySettings {
  if (!raw || typeof raw !== "object") return { ...EMPTY_AGENT_PERSONALITY };
  const o = raw as Record<string, unknown>;
  const examples = Array.isArray(o.examples)
    ? o.examples.map((x) => String(x).trim()).filter(Boolean)
    : [];
  return {
    tone: typeof o.tone === "string" ? o.tone : "",
    formality: typeof o.formality === "string" ? o.formality : "",
    empathy: typeof o.empathy === "string" ? o.empathy : "",
    appointmentStyle:
      typeof o.appointmentStyle === "string" ? o.appointmentStyle : "",
    instructions: typeof o.instructions === "string" ? o.instructions : "",
    examples,
  };
}

export async function fetchAgentPersonality(): Promise<AgentPersonalitySettings> {
  return normalizeAgentPersonality(
    await apiFetch<unknown>("/settings/agent-personality"),
  );
}

export async function generateAgentPersonalityExamples(
  settings: AgentPersonalitySettings,
): Promise<{ examples: string[]; model: string }> {
  const raw = await apiFetch<unknown>("/settings/agent-personality/examples", {
    method: "POST",
    body: JSON.stringify(settings),
  });
  if (!raw || typeof raw !== "object") return { examples: [], model: "" };
  const o = raw as Record<string, unknown>;
  return {
    examples: Array.isArray(o.examples)
      ? o.examples.map((x) => String(x).trim()).filter(Boolean)
      : [],
    model: typeof o.model === "string" ? o.model : "",
  };
}

export async function saveAgentPersonality(
  settings: AgentPersonalitySettings,
): Promise<AgentPersonalitySettings & { bridgeSaved?: boolean }> {
  const raw = await apiFetch<unknown>("/settings/agent-personality", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
  return {
    ...normalizeAgentPersonality(raw),
    bridgeSaved:
      raw && typeof raw === "object" && "bridgeSaved" in raw
        ? Boolean((raw as { bridgeSaved?: unknown }).bridgeSaved)
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Agent learning preferences (R2-35 follow-up — Claudia #35 backend live)
// ---------------------------------------------------------------------------
//
// Two tenant-scoped, server-persisted toggles that govern how intrusive
// the suggested-learning flow is. They never auto-approve a learning —
// at most they create a pending row that the operator must still review
// in Settings.
//
//   showSuggestionAfterReplies (default true)
//     ON  → after a teachable Send / Send & Resolve / Resolve, the
//           Suggested Learning card appears over the conversation pane.
//     OFF → the card never appears. If a pending row was created
//           (depends on the second toggle) it is still visible in
//           Settings → Agent learnings → Pending.
//
//   createPendingLearningFromOperatorReplies (default false)
//     ON  → operator replies are persisted as PENDING learning rows
//           for later review (never auto-approved).
//     OFF → no pending row is created. The reply is only sent to the
//           customer; the Agent does not learn from it unless the
//           operator explicitly triggers a learning some other way.
//
// Backend (Claudia #35):
//   GET  /api/{tenant}/dashboard/api/settings/agent-learnings
//   PUT  /api/{tenant}/dashboard/api/settings/agent-learnings
// Body shape (both directions):
//   { "showSuggestionAfterReplies": boolean,
//     "createPendingLearningFromOperatorReplies": boolean }
// Tenant-scoped. Server persisted. Cross-browser, cross-device, team-wide.
// No client-side fallback. Server is source of truth.

export interface AgentLearningPrefs {
  showSuggestionAfterReplies: boolean;
  createPendingLearningFromOperatorReplies: boolean;
}

/**
 * Tenant defaults. Used only when the backend response is missing a
 * key (contract violation) or when the Inbox needs a fallback before
 * the first GET resolves. New tenants should be initialised by the
 * backend with these same defaults.
 */
export const DEFAULT_AGENT_LEARNING_PREFS: AgentLearningPrefs = {
  showSuggestionAfterReplies: true,
  createPendingLearningFromOperatorReplies: false,
};

function coerceAgentLearningPrefs(raw: unknown): AgentLearningPrefs {
  // Missing / malformed → fall back to documented defaults rather than
  // inventing values. This keeps the contract surface honest if Claudia
  // ever ships a partial response.
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_AGENT_LEARNING_PREFS };
  }
  const o = raw as Record<string, unknown>;
  const show = o.showSuggestionAfterReplies;
  const create = o.createPendingLearningFromOperatorReplies;
  return {
    showSuggestionAfterReplies:
      typeof show === "boolean"
        ? show
        : DEFAULT_AGENT_LEARNING_PREFS.showSuggestionAfterReplies,
    createPendingLearningFromOperatorReplies:
      typeof create === "boolean"
        ? create
        : DEFAULT_AGENT_LEARNING_PREFS.createPendingLearningFromOperatorReplies,
  };
}

export async function fetchAgentLearningPrefs(): Promise<AgentLearningPrefs> {
  const raw = await apiFetch<unknown>("/settings/agent-learnings");
  return coerceAgentLearningPrefs(raw);
}

export async function setAgentLearningPrefs(
  prefs: AgentLearningPrefs,
): Promise<AgentLearningPrefs> {
  const raw = await apiFetch<unknown>("/settings/agent-learnings", {
    method: "PUT",
    body: JSON.stringify(prefs),
  });
  if (!raw || typeof raw !== "object") return { ...prefs };
  return coerceAgentLearningPrefs(raw);
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

// ---------------------------------------------------------------------------
// Escalation alert settings
// ---------------------------------------------------------------------------
//
// Backend (Python) endpoints:
//   GET  /api/{client}/dashboard/api/settings/escalation-alerts
//   PUT  /api/{client}/dashboard/api/settings/escalation-alerts
//
// Canonical response shape:
//   { "channels": { "email": { enabled, destination, deliveryStatus? },
//                   "whatsapp": {...}, "messenger": {...}, "telegram": {...} } }
//
// We also accept a flat shape `{ email: {...}, whatsapp: {...}, ... }`
// because Jr's first cut may not nest under `channels` consistently.

export type EscalationAlertChannelKey =
  | "email"
  | "whatsapp"
  | "messenger"
  | "telegram";

export interface EscalationAlertChannelPref {
  enabled: boolean;
  destination: string;
  /**
   * Optional second destination. For email this is the operator-supplied
   * "alternative email" — when set, the backend fans out escalation
   * alerts to BOTH `destination` (or its resolved form) AND this address.
   * Empty string / null means "no alternative".
   */
  alternativeDestination?: string | null;
  /**
   * Backend-resolved real address when `destination` is a sentinel like
   * `"default"`. For email this is the actual `support_email` from the
   * client config, so the UI can show "Always on, sent to
   * hello@unboks.org" instead of the literal string "default".
   */
  resolvedDestination?: string | null;
  /**
   * Optional backend-supplied delivery status. Free-form so we can render
   * any future status the backend introduces. Common values today:
   *   "active" | "saved_only" | "provider_not_configured" | "failed"
   *   | "default" | "skipped" | "pending_activation"
   */
  deliveryStatus?: string | null;
  /**
   * WhatsApp-only: whether the operator's WhatsApp number has been
   * resolved by the Zernio routing service yet. When `true` the
   * channel can actually deliver alerts; when `false` the destination
   * is saved but inert until the operator sends START to the business
   * number. The backend exposes this as `channels.whatsapp.zernioResolved`
   * (camelCase) — we also accept `zernio_resolved` for forward
   * compatibility. `undefined` means the backend didn't include the
   * field at all (older deployment) and we can't make a claim either way.
   */
  zernioResolved?: boolean | null;
}

/**
 * Which categories of alerts the tenant wants delivered.
 *  - `escalations`  → urgent moments where Marina needs human help
 *  - `appointments` → confirmed bookings / scheduled calls
 *
 * Both default to `true` for backward compatibility: an older backend
 * that doesn't yet include `alertTypes` in the GET response is treated
 * as "all alert types on", matching the pre-toggle behaviour.
 */
export interface EscalationAlertTypes {
  escalations: boolean;
  appointments: boolean;
}

export interface EscalationAlertSettings {
  channels: Partial<
    Record<EscalationAlertChannelKey, EscalationAlertChannelPref>
  >;
  alertTypes: EscalationAlertTypes;
}

const DEFAULT_ALERT_TYPES: EscalationAlertTypes = {
  escalations: true,
  appointments: true,
};

function pickAlertTypes(raw: unknown): EscalationAlertTypes {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ALERT_TYPES };
  const o = raw as Record<string, unknown>;
  // Tolerate snake_case from older Python payloads as well as the
  // canonical camelCase wire shape documented in the issue.
  const escRaw = o.escalations ?? o.escalation ?? o.escalation_alerts;
  const aptRaw = o.appointments ?? o.appointment ?? o.appointment_alerts;
  return {
    escalations:
      typeof escRaw === "boolean" ? escRaw : DEFAULT_ALERT_TYPES.escalations,
    appointments:
      typeof aptRaw === "boolean" ? aptRaw : DEFAULT_ALERT_TYPES.appointments,
  };
}

function pickChannelPref(raw: unknown): EscalationAlertChannelPref | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const enabledRaw = o.enabled;
  const enabled =
    typeof enabledRaw === "boolean"
      ? enabledRaw
      : enabledRaw === "true"
        ? true
        : false;
  const destRaw = o.destination ?? o.address ?? o.value ?? "";
  const destination = typeof destRaw === "string" ? destRaw : "";
  const status =
    typeof o.deliveryStatus === "string"
      ? o.deliveryStatus
      : typeof o.delivery_status === "string"
        ? o.delivery_status
        : typeof o.status === "string"
          ? o.status
          : null;
  // Backend may return the resolved real address under several aliases.
  // For email that's `support_email` from the client config; for other
  // channels it could be a routed inbox address. Tried in order so the
  // strongest signal wins.
  const resolvedRaw =
    o.resolvedDestination ??
    o.resolved_destination ??
    o.resolvedAddress ??
    o.resolved_address ??
    o.email ??
    o.supportEmail ??
    o.support_email ??
    null;
  const resolvedDestination =
    typeof resolvedRaw === "string" && resolvedRaw.trim().length > 0
      ? resolvedRaw.trim()
      : null;
  // Backend may surface the second/alt address under several aliases.
  // `alternativeDestination` is the canonical wire name; the rest are
  // tolerated so older payload shapes don't silently lose the value.
  const altRaw =
    o.alternativeDestination ??
    o.alternative_destination ??
    o.alternativeEmail ??
    o.alternative_email ??
    o.secondaryEmail ??
    o.secondary_email ??
    o.backupEmail ??
    o.backup_email ??
    null;
  const alternativeDestination =
    typeof altRaw === "string" && altRaw.trim().length > 0
      ? altRaw.trim()
      : null;
  // Per the issue, the backend now reports WhatsApp activation state as
  // `channels.whatsapp.zernioResolved`. Tolerate the snake_case alias
  // and treat any non-boolean value as "unknown" so we never lie about
  // activation when the field is missing.
  const zernioRaw =
    "zernioResolved" in o
      ? o.zernioResolved
      : "zernio_resolved" in o
        ? o.zernio_resolved
        : undefined;
  const zernioResolved = typeof zernioRaw === "boolean" ? zernioRaw : undefined;
  return {
    enabled,
    destination,
    alternativeDestination,
    resolvedDestination,
    deliveryStatus: status,
    zernioResolved,
  };
}

/**
 * Normalize whatever the backend returned into our canonical
 * `{ channels: { email, whatsapp, messenger, telegram } }` shape. Accepts
 * either nested-under-`channels` or flat root-level keys.
 */
export function normalizeEscalationAlertSettings(
  raw: unknown,
): EscalationAlertSettings {
  const empty: EscalationAlertSettings = {
    channels: {},
    alertTypes: { ...DEFAULT_ALERT_TYPES },
  };
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as Record<string, unknown>;
  const src =
    o.channels && typeof o.channels === "object"
      ? (o.channels as Record<string, unknown>)
      : o;
  const out: EscalationAlertSettings = {
    channels: {},
    // Tolerate both `alertTypes` (canonical) and `alert_types` (snake).
    alertTypes: pickAlertTypes(o.alertTypes ?? o.alert_types),
  };
  for (const key of [
    "email",
    "whatsapp",
    "messenger",
    "telegram",
  ] as EscalationAlertChannelKey[]) {
    const pref = pickChannelPref(src[key]);
    if (pref) out.channels[key] = pref;
  }
  return out;
}

export async function getEscalationAlertSettings(): Promise<EscalationAlertSettings> {
  const raw = await apiFetch<unknown>("/settings/escalation-alerts");
  return normalizeEscalationAlertSettings(raw);
}

export async function updateEscalationAlertSettings(
  payload: EscalationAlertSettings,
): Promise<EscalationAlertSettings> {
  const raw = await apiFetch<unknown>("/settings/escalation-alerts", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return normalizeEscalationAlertSettings(raw);
}

export type MermaidReservationStage =
  | "details"
  | "quote"
  | "payment"
  | "booked"
  | "cancelled";

export interface MermaidReservationItem {
  key: string;
  label: string;
  quantity: number;
  unit_amount: number;
  line_total: number;
}

export interface MermaidPrimaryAction {
  id: "review_details" | "view_quote" | "open_conversation" | "view_receipt";
  label: string;
  href: string;
}

export interface MermaidReservationSummary {
  contactPhone?: string | null;
  childAges?: Array<{ value: number; unit: "months" | "years" }>;
  partyDescription?: string;
  customerId?: number | null;
  publicId: string;
  conversationId: string;
  customerName: string;
  language: string;
  tripDate: string;
  adults: number;
  children: number;
  infants: number;
  pickupPreference: "pier" | "pickup_requested";
  pickupLocation?: string | null;
  dietaryRequirements?: string | null;
  accessibilityNotes?: string | null;
  specialRequests?: string | null;
  catalogVersion: string;
  currency: string;
  total: number;
  items: MermaidReservationItem[];
  state: string;
  stage: MermaidReservationStage;
  availabilitySource: "demo_assumed";
  bookingCode?: string | null;
  quotePublicId?: string | null;
  paymentReference?: string | null;
  receiptPublicId?: string | null;
  humanTakeover: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  primaryAction: MermaidPrimaryAction | null;
  demo: true;
  /** Staff-only and intentionally excluded from printable/public documents. */
  crewAssistance?: MermaidCrewAssistance | null;
}

export interface MermaidReservationDetail extends MermaidReservationSummary {
  documents: Array<{
    public_id: string;
    kind: "quote" | "receipt";
    filename: string;
    sha256: string;
    delivery_status?: string | null;
    delivery_attempts?: number | null;
    delivery_error?: string | null;
    created_at: string;
  }>;
  events: Array<{
    id: number;
    type: string;
    fromState?: string | null;
    toState?: string | null;
    actor: string;
    reason: string;
    revision: number;
    createdAt: string;
  }>;
  conversation: Array<{ role: string; text: string; created_at: string }>;
}

export interface MermaidCatalogResponse {
  revision?: string;
  editable?: boolean;
  catalog: {
    version: string;
    service: {
      name: string;
      operating_weekdays: string[];
      meeting_point: string;
      arrival_time: string;
      island_departure_time: string;
      pickup_minutes_before_arrival?: number;
    };
    pricing: {
      currencies: Record<string, Record<string, number>>;
      default_currency: string;
      pickup_price?: number | null;
      pickup_currency?: string;
      pickup_basis?: "per_vehicle" | "per_booking";
      pickup_coverage?: string;
      pickup_vehicles?: Array<{ key: string; capacity: number; price: number }>;
      pickup_overflow?: "team_review" | "multiple_vans";
    };
    included: string[];
    extras?: string[];
    bring: string[];
    policies: { cancellation: string; safety: string; insurance: string };
  };
  demo: true;
  remindersEnabled: false;
}

function parseMermaidCrewAssistance(
  raw: unknown,
  source: string,
): MermaidCrewAssistance | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError(502, `Invalid ${source} crew-assistance data.`);
  }
  const row = raw as Record<string, unknown>;
  const id = pickStr(row, "id");
  const kind = pickStr(row, "kind");
  const note = pickStr(row, "note");
  const status = pickStr(row, "status");
  const revision = row.revision;
  const createdAt = pickStr(row, "createdAt", "created_at");
  const updatedAt = pickStr(row, "updatedAt", "updated_at");
  const acknowledgedAt =
    pickStr(row, "acknowledgedAt", "acknowledged_at") ?? null;
  const acknowledgedBy =
    pickStr(row, "acknowledgedBy", "acknowledged_by") ?? null;
  if (
    !id ||
    kind !== "wheelchair" ||
    !note ||
    !["unacknowledged", "acknowledged", "withdrawn"].includes(status ?? "") ||
    !Number.isInteger(revision) ||
    (revision as number) < 0 ||
    !createdAt ||
    !updatedAt ||
    (status === "acknowledged" && (!acknowledgedAt || !acknowledgedBy))
  ) {
    throw new ApiError(502, `Invalid ${source} crew-assistance data.`);
  }
  return {
    id,
    kind: "wheelchair",
    note,
    relationship: pickStr(row, "relationship") ?? null,
    tripDate: pickStr(row, "tripDate", "trip_date") ?? null,
    reservationPublicId:
      pickStr(row, "reservationPublicId", "reservation_public_id") ?? null,
    status: status as MermaidCrewAssistance["status"],
    revision: revision as number,
    createdAt,
    updatedAt,
    acknowledgedAt,
    acknowledgedBy,
  };
}

function parseMermaidReservationSummary<T extends MermaidReservationSummary>(
  raw: T,
): T {
  return {
    ...raw,
    crewAssistance: parseMermaidCrewAssistance(
      raw.crewAssistance,
      "reservation",
    ),
  };
}

export async function fetchMermaidReservations(
  query = "",
): Promise<MermaidReservationSummary[]> {
  const params = new URLSearchParams({ _refresh: Date.now().toString() });
  if (query.trim()) params.set("query", query.trim());
  const response = await apiFetch<{
    items: MermaidReservationSummary[];
    demo: true;
    remindersEnabled: false;
  }>(
    `/mermaid-reservations?${params.toString()}`,
    {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    },
    false,
    true,
  );
  if (!Array.isArray(response.items)) {
    throw new ApiError(502, "Invalid Mermaid reservation response.");
  }
  return response.items.map(parseMermaidReservationSummary);
}

export async function fetchMermaidReservation(
  publicId: string,
): Promise<MermaidReservationDetail> {
  const response = await apiFetch<MermaidReservationDetail>(
    `/mermaid-reservations/${encodeURIComponent(publicId)}`,
    { cache: "no-store" },
    false,
    true,
  );
  return parseMermaidReservationSummary(response);
}

export async function fetchMermaidCrewAssistance(
  status: "unacknowledged" | "acknowledged" | "withdrawn" | "all" =
    "unacknowledged",
): Promise<MermaidCrewAssistanceQueueItem[]> {
  const params = new URLSearchParams({
    status,
    _refresh: Date.now().toString(),
  });
  const response = await apiFetch<{ items: unknown[] }>(
    `/mermaid-crew-assistance?${params.toString()}`,
    {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    },
    false,
    true,
  );
  if (!Array.isArray(response.items)) {
    throw new ApiError(502, "Invalid Mermaid crew-assistance response.");
  }
  const deduplicated = new Map<string, MermaidCrewAssistanceQueueItem>();
  for (const raw of response.items) {
    const item = parseMermaidCrewAssistance(raw, "queue");
    const row = raw as Record<string, unknown>;
    const conversationId = pickStr(row, "conversationId", "conversation_id");
    const customerName = pickStr(row, "customerName", "customer_name");
    if (!item || !conversationId || !customerName) {
      throw new ApiError(502, "Invalid Mermaid crew-assistance response.");
    }
    const queueItem = { ...item, conversationId, customerName };
    const current = deduplicated.get(item.id);
    if (
      !current ||
      item.revision > current.revision ||
      (item.revision === current.revision && item.updatedAt > current.updatedAt)
    ) {
      deduplicated.set(item.id, queueItem);
    }
  }
  return [...deduplicated.values()];
}

export async function acknowledgeMermaidCrewAssistance(
  id: string,
  expectedRevision: number,
  acknowledgedBy: string,
): Promise<MermaidCrewAssistance> {
  const response = await apiFetch<{ item: unknown }>(
    `/mermaid-crew-assistance/${encodeURIComponent(id)}/acknowledge`,
    {
      method: "POST",
      body: JSON.stringify({ expectedRevision, acknowledgedBy }),
    },
    false,
    true,
  );
  const item = parseMermaidCrewAssistance(response.item, "acknowledgement");
  if (!item) {
    throw new ApiError(502, "Invalid Mermaid acknowledgement response.");
  }
  return item;
}

export function fetchMermaidCatalog(): Promise<MermaidCatalogResponse> {
  return apiFetch<MermaidCatalogResponse>(
    "/mermaid-reservations/catalog",
    { cache: "no-store" },
    false,
    true,
  );
}

export type MermaidCatalogChanges = Pick<
  MermaidCatalogResponse["catalog"],
  "service" | "pricing" | "included" | "bring" | "extras" | "policies"
>;

export function publishMermaidCatalog(
  expectedRevision: string,
  changes: MermaidCatalogChanges,
): Promise<MermaidCatalogResponse> {
  return apiFetch<MermaidCatalogResponse>(
    "/mermaid-reservations/catalog",
    {
      method: "PUT",
      body: JSON.stringify({ expected_revision: expectedRevision, changes }),
    },
    false,
    true,
  );
}

export interface MermaidCustomerDetails {
  customer_name?: string;
  contact_phone?: string;
  language?: string;
  trip_date?: string;
  adults?: number;
  children?: number;
  infants?: number;
  child_ages?: Array<{ value: number; unit: "months" | "years" }>;
  pickup_preference?: string;
  pickup_location?: string;
  dietary_requirements?: string;
  accessibility_notes?: string;
  special_requests?: string;
  phase?: string;
}
export interface MermaidCustomer {
  id: number;
  customerName: string;
  conversationId: string;
  firstSeen: string;
  lastSeen: string;
  details: MermaidCustomerDetails;
  reservationCount: number;
  messageCount: number;
}
export interface MermaidCustomerAccount extends MermaidCustomer {
  reservations: Array<
    MermaidReservationSummary & {
      documents: MermaidReservationDetail["documents"];
    }
  >;
}
export interface MermaidCustomerMessage {
  id: number;
  role: string;
  text: string;
  created_at: string;
  sender_name: string;
  channel: string;
}
export interface MermaidCustomerRevision {
  id: number;
  details: MermaidCustomerDetails;
  createdAt: string;
}
export function fetchMermaidCustomers(query = "", offset = 0) {
  const params = new URLSearchParams({ query, offset: String(offset) });
  return apiFetch<{ items: MermaidCustomer[]; nextOffset: number | null }>(
    `/mermaid-customers?${params}`,
    { cache: "no-store" },
    false,
    true,
  );
}
export function fetchMermaidCustomer(id: string) {
  return apiFetch<MermaidCustomerAccount>(
    `/mermaid-customers/${encodeURIComponent(id)}`,
    { cache: "no-store" },
    false,
    true,
  );
}
export function fetchMermaidCustomerHistory<
  T extends MermaidCustomerMessage | MermaidCustomerRevision,
>(id: string, before: number | null, changes = false) {
  const params = new URLSearchParams({ changes: String(changes) });
  if (before !== null) params.set("before", String(before));
  return apiFetch<{ items: T[]; nextBefore: number | null }>(
    `/mermaid-customers/${encodeURIComponent(id)}/history?${params}`,
    { cache: "no-store" },
    false,
    true,
  );
}
export async function fetchMermaidCustomerDocument(
  customerId: string,
  documentId: string,
): Promise<Blob> {
  const { tenantSlug, token } = captureTenantRequestScope();
  if (tenantSlug !== "mermaid")
    throw new ApiError(409, "Workspace response rejected");
  const path = `/mermaid-customers/${encodeURIComponent(customerId)}/documents/${encodeURIComponent(documentId)}`;
  const response = await fetch(`${getApiBase(tenantSlug)}${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if ((response.status === 401 || response.status === 403) && token)
    handleAuthFailure(tenantSlug);
  if (!response.ok)
    throw new ApiError(
      response.status,
      "The PDF could not be downloaded. Please try again.",
    );
  assertResponseTenant(response, null, tenantSlug, path, true);
  const blob = await response.blob();
  if (getClientSlug() !== tenantSlug)
    throw new ApiError(409, "Workspace response rejected");
  if (!blob.type.startsWith("application/pdf"))
    throw new ApiError(422, "Unexpected document format.");
  return blob;
}
