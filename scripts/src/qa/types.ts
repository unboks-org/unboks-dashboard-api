/**
 * QA Simulator — shared types.
 *
 * These types describe scenario records, run results, and the final
 * report shape. They are shared by the scenario file, the runner, and
 * the report generator so the shapes never drift apart.
 */

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export type Channel = "email" | "whatsapp" | "sms" | "messenger" | "telegram";

export type Persona =
  | "polite_customer"
  | "confused_customer"
  | "angry_customer"
  | "impatient_customer"
  | "non_native_speaker"
  | "spam_sender"
  | "vague_customer"
  | "multilingual_customer"
  | "repeat_asker"
  | "refund_demander"
  | "human_requester"
  | "price_asker"
  | "reschedule_customer"
  | "cancellation_customer"
  | "multi_message_customer";

export interface ScenarioExpected {
  /** True if this scenario should generate an escalation. */
  shouldEscalate: boolean;
  /** True if Marina should ask the customer a clarifying question. */
  shouldAskClarifyingQuestion?: boolean;
  /** True if a new appointment record should be created. */
  shouldCreateAppointment?: boolean;
  /** Strings that MUST NOT appear in any Marina reply (e.g. internal emails). */
  mustNotContain?: string[];
  /** Strings that SHOULD appear in a Marina reply (loose check). */
  shouldContain?: string[];
  /** Expected escalation mode if shouldEscalate is true. */
  escalationMode?: "soft" | "hard";
}

export interface QAScenario {
  testId: string;
  channel: Channel;
  persona: Persona;
  /** Always calvinadamus@gmail.com for email scenarios. */
  senderEmail?: string;
  /** WhatsApp sender number for whatsapp channel. */
  senderPhone?: string;
  /** Human-readable description of what the scenario tests. */
  description: string;
  /** Ordered list of customer messages. Multi-message scenarios have 2+. */
  messages: string[];
  expected: ScenarioExpected;
  /** Severity for reporting. */
  severity: "critical" | "high" | "medium" | "low";
  /** Category group for summary section. */
  category:
    | "appointment"
    | "faq"
    | "complaint"
    | "reply-threading"
    | "dashboard-action"
    | "edge-case";
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Run result
// ---------------------------------------------------------------------------

export type CheckStatus = "pass" | "fail" | "skip" | "todo";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail?: string;
}

export type ScenarioRunStatus = "passed" | "failed" | "skipped" | "dry-run";

export interface ScenarioResult {
  testId: string;
  channel: Channel;
  category: QAScenario["category"];
  severity: QAScenario["severity"];
  status: ScenarioRunStatus;
  /** Wall-clock time the run started. ISO string. */
  startedAt: string;
  /** Duration in ms. */
  durationMs: number;
  checks: CheckResult[];
  /** Error message if the run itself failed (not a check failure). */
  error?: string;
  /** API IDs discovered during the run. */
  ids?: {
    conversationId?: string;
    escalationId?: string;
    appointmentId?: string;
  };
}

// ---------------------------------------------------------------------------
// Final report
// ---------------------------------------------------------------------------

export interface QAReportSummary {
  date: string;
  environment: string;
  tenant: string;
  qaCustomerEmail: string;
  mode: "dry-run" | "live";
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  dryRun: number;
  bySeverity: {
    critical: { passed: number; failed: number };
    high: { passed: number; failed: number };
    medium: { passed: number; failed: number };
    low: { passed: number; failed: number };
  };
  byCategory: Record<QAScenario["category"], { passed: number; failed: number; skipped: number }>;
}

export interface QAReport {
  summary: QAReportSummary;
  results: ScenarioResult[];
  missingEndpoints: string[];
  blockers: string[];
}
