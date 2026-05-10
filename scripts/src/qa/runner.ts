/**
 * QA Simulator — runner CLI.
 *
 * Usage:
 *   # Dry-run (no API calls, validates scenario shapes only):
 *   pnpm --filter @workspace/scripts run qa:dry-run
 *
 *   # Live mode with read-only API verification:
 *   QA_TOKEN=<bearer-token> pnpm --filter @workspace/scripts run qa:live
 *
 *   # Single scenario:
 *   QA_TOKEN=<token> pnpm --filter @workspace/scripts run qa:live -- --only APPT-001
 *
 *   # Category filter:
 *   QA_TOKEN=<token> pnpm --filter @workspace/scripts run qa:live -- --category appointment
 *
 *   # Save reports:
 *   QA_TOKEN=<token> pnpm --filter @workspace/scripts run qa:live -- --out reports/
 *
 * Environment variables:
 *   QA_API_BASE   — default https://api.unboks.org
 *   QA_CLIENT     — default unboks
 *   QA_TOKEN      — bearer token (required for live mode)
 *
 * SAFETY
 * ------
 *   Phase 1 only. No live message injection. Only read-only GET calls are
 *   made (fetchConversations, fetchEscalations, fetchAppointments,
 *   fetchConfig, fetchAlertSettings). No messages are sent. No data is
 *   mutated. No production alert channels are triggered.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  fetchConversations,
  fetchEscalations,
  fetchAppointments,
  fetchConfig,
  fetchAlertSettings,
  hasToken,
  QAApiError,
} from "./api-client.js";
import { buildJsonReport, buildMarkdownReport } from "./report.js";
import type {
  QAScenario,
  ScenarioResult,
  CheckResult,
  QAReport,
  QAReportSummary,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DRY_RUN = process.env["QA_DRY_RUN"] === "1" || process.argv.includes("--dry-run");
const MODE: "dry-run" | "live" = DRY_RUN || !hasToken() ? "dry-run" : "live";
const QA_CLIENT = process.env["QA_CLIENT"] ?? "unboks";
const QA_EMAIL = "calvinadamus@gmail.com";
const QA_API_BASE = process.env["QA_API_BASE"] ?? "https://api.unboks.org";

// Parse CLI flags
function getFlag(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1] ?? null;
}
const onlyId = getFlag("--only");
const categoryFilter = getFlag("--category") as QAScenario["category"] | null;
const outDir = getFlag("--out");

// ---------------------------------------------------------------------------
// Load scenarios
// ---------------------------------------------------------------------------

function loadScenarios(): QAScenario[] {
  const scenariosPath = join(
    __dirname,
    "../../../tests/qa-scenarios/unboks-customer-scenarios.json",
  );
  const raw = readFileSync(scenariosPath, "utf-8");
  const all = JSON.parse(raw) as QAScenario[];

  if (onlyId) return all.filter((s) => s.testId === onlyId);
  if (categoryFilter) return all.filter((s) => s.category === categoryFilter);
  return all;
}

// ---------------------------------------------------------------------------
// Per-scenario runner
// ---------------------------------------------------------------------------

/**
 * Run a single scenario.
 *
 * In dry-run mode this validates the scenario shape and marks every check
 * as "dry-run" (not pass/fail). No API calls are made.
 *
 * In live mode we make read-only API calls to verify the current state of
 * the dashboard, then emit best-effort pass/fail/skip checks.
 *
 * NOTE: Live message injection is Phase 2. In Phase 1, the live runner
 * checks that the API surface is reachable and reports counts; it cannot
 * yet verify that a specific test message caused a specific escalation
 * because no messages are sent. Those checks are marked "skip" with a
 * TODO note.
 */
async function runScenario(
  scenario: QAScenario,
  snapshot: DashboardSnapshot | null,
): Promise<ScenarioResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const checks: CheckResult[] = [];

  try {
    if (MODE === "dry-run") {
      // Shape validation only
      checks.push({
        name: "scenario shape valid",
        status: validateScenarioShape(scenario) ? "pass" : "fail",
      });
      checks.push({
        name: "messages contain [QA TEST] marker",
        status: scenario.messages.every((m) => m.includes("[QA TEST]"))
          ? "pass"
          : "fail",
        detail: scenario.messages.every((m) => m.includes("[QA TEST]"))
          ? undefined
          : "One or more messages are missing the [QA TEST] marker",
      });
      checks.push({
        name: "mustNotContain has no em-dash check",
        status:
          scenario.expected.mustNotContain?.includes("\u2014") ? "pass" : "skip",
        detail: "em-dash guard present",
      });
      checks.push({
        name: "internal email guard",
        status:
          scenario.expected.mustNotContain?.includes("butlerbensonagent@gmail.com")
            ? "pass"
            : "skip",
        detail: "butlerbensonagent guard present",
      });

      return {
        testId: scenario.testId,
        channel: scenario.channel,
        category: scenario.category,
        severity: scenario.severity,
        status: "dry-run",
        startedAt,
        durationMs: Date.now() - t0,
        checks,
      };
    }

    // Live mode: read-only verification against the current dashboard state.
    // Message injection is Phase 2; for now we verify connectivity and
    // surface counts.
    if (!snapshot) {
      return {
        testId: scenario.testId,
        channel: scenario.channel,
        category: scenario.category,
        severity: scenario.severity,
        status: "failed",
        startedAt,
        durationMs: Date.now() - t0,
        checks: [{ name: "dashboard snapshot available", status: "fail", detail: "snapshot is null" }],
        error: "Dashboard snapshot unavailable — API calls failed at startup",
      };
    }

    // Check: inbox is reachable
    checks.push({
      name: "inbox reachable",
      status: snapshot.inboxOk ? "pass" : "fail",
      detail: snapshot.inboxOk
        ? `${snapshot.conversationCount} conversation(s)`
        : snapshot.inboxError,
    });

    // Check: escalations reachable
    checks.push({
      name: "escalations reachable",
      status: snapshot.escalationsOk ? "pass" : "fail",
      detail: snapshot.escalationsOk
        ? `${snapshot.escalationCount} escalation(s)`
        : snapshot.escalationsError,
    });

    // Check: appointments reachable (skip if not connected)
    if (!snapshot.appointmentsConnected) {
      checks.push({
        name: "appointments reachable",
        status: "skip",
        detail: "appointments endpoint not yet connected",
      });
    } else {
      checks.push({
        name: "appointments reachable",
        status: snapshot.appointmentsOk ? "pass" : "fail",
        detail: snapshot.appointmentsOk
          ? `${snapshot.appointmentCount} appointment(s)`
          : snapshot.appointmentsError,
      });
    }

    // Check: settings reachable
    checks.push({
      name: "settings reachable",
      status: snapshot.configOk ? "pass" : "fail",
      detail: snapshot.configError,
    });

    // Check: alert settings / WhatsApp status
    checks.push({
      name: "alert settings reachable",
      status: snapshot.alertsOk ? "pass" : "fail",
      detail: snapshot.alertsError,
    });
    checks.push({
      name: "whatsapp status visible",
      status: snapshot.whatsappPresent ? "pass" : "fail",
      detail: snapshot.whatsappPresent
        ? `enabled=${String(snapshot.whatsappEnabled)}`
        : "channels.whatsapp missing from alert settings",
    });

    // Phase 2 stubs — message injection not yet implemented
    if (scenario.expected.shouldEscalate) {
      checks.push({
        name: "escalation appears after message injection",
        status: "skip",
        detail: "TODO Phase 2: requires live message injection",
      });
    }
    if (scenario.expected.shouldCreateAppointment) {
      checks.push({
        name: "appointment record created after message injection",
        status: "skip",
        detail: "TODO Phase 2: requires live message injection",
      });
    }
    if (scenario.expected.mustNotContain?.length) {
      checks.push({
        name: "reply mustNotContain (identity leak / em-dash guard)",
        status: "skip",
        detail: "TODO Phase 2: requires fetching Marina reply after injection",
      });
    }

    const anyFail = checks.some((c) => c.status === "fail");
    return {
      testId: scenario.testId,
      channel: scenario.channel,
      category: scenario.category,
      severity: scenario.severity,
      status: anyFail ? "failed" : "passed",
      startedAt,
      durationMs: Date.now() - t0,
      checks,
    };
  } catch (err) {
    return {
      testId: scenario.testId,
      channel: scenario.channel,
      category: scenario.category,
      severity: scenario.severity,
      status: "failed",
      startedAt,
      durationMs: Date.now() - t0,
      checks,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Dashboard snapshot — single parallel fetch at startup for live mode
// ---------------------------------------------------------------------------

interface DashboardSnapshot {
  inboxOk: boolean;
  inboxError?: string;
  conversationCount: number;
  escalationsOk: boolean;
  escalationsError?: string;
  escalationCount: number;
  appointmentsOk: boolean;
  appointmentsError?: string;
  appointmentsConnected: boolean;
  appointmentCount: number;
  configOk: boolean;
  configError?: string;
  alertsOk: boolean;
  alertsError?: string;
  whatsappPresent: boolean;
  whatsappEnabled: boolean;
}

async function buildSnapshot(): Promise<DashboardSnapshot> {
  const [convRes, escRes, apptRes, cfgRes, alertRes] = await Promise.allSettled([
    fetchConversations(),
    fetchEscalations("all"),
    fetchAppointments(),
    fetchConfig(),
    fetchAlertSettings(),
  ]);

  const inboxOk = convRes.status === "fulfilled";
  const escOk = escRes.status === "fulfilled";
  const apptOk = apptRes.status === "fulfilled";
  const cfgOk = cfgRes.status === "fulfilled";
  const alertOk = alertRes.status === "fulfilled";

  const appt = apptOk ? apptRes.value : null;
  const alert = alertOk ? alertRes.value : null;

  return {
    inboxOk,
    inboxError: inboxOk ? undefined : descErr(convRes),
    conversationCount: inboxOk ? convRes.value.length : 0,
    escalationsOk: escOk,
    escalationsError: escOk ? undefined : descErr(escRes),
    escalationCount: escOk ? escRes.value.length : 0,
    appointmentsOk: apptOk && (appt?.connected ?? false),
    appointmentsError: apptOk ? undefined : descErr(apptRes),
    appointmentsConnected: apptOk && (appt?.connected ?? false),
    appointmentCount: apptOk && appt?.connected ? appt.items.length : 0,
    configOk: cfgOk,
    configError: cfgOk ? undefined : descErr(cfgRes),
    alertsOk: alertOk,
    alertsError: alertOk ? undefined : descErr(alertRes),
    whatsappPresent: alertOk && alert?.channels?.whatsapp !== undefined,
    whatsappEnabled: alertOk && (alert?.channels?.whatsapp?.enabled ?? false),
  };
}

function descErr(r: PromiseRejectedResult | PromiseFulfilledResult<unknown>): string | undefined {
  if (r.status === "fulfilled") return undefined;
  const e = r.reason;
  if (e instanceof QAApiError) return `HTTP ${e.status}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}

// ---------------------------------------------------------------------------
// Shape validator
// ---------------------------------------------------------------------------

function validateScenarioShape(s: QAScenario): boolean {
  return (
    typeof s.testId === "string" &&
    s.testId.length > 0 &&
    Array.isArray(s.messages) &&
    s.messages.length > 0 &&
    typeof s.expected === "object"
  );
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

function buildSummary(
  results: ScenarioResult[],
  mode: "dry-run" | "live",
): QAReportSummary {
  const bySeverity = {
    critical: { passed: 0, failed: 0 },
    high: { passed: 0, failed: 0 },
    medium: { passed: 0, failed: 0 },
    low: { passed: 0, failed: 0 },
  };
  const byCategory: QAReportSummary["byCategory"] = {
    appointment: { passed: 0, failed: 0, skipped: 0 },
    faq: { passed: 0, failed: 0, skipped: 0 },
    complaint: { passed: 0, failed: 0, skipped: 0 },
    "reply-threading": { passed: 0, failed: 0, skipped: 0 },
    "dashboard-action": { passed: 0, failed: 0, skipped: 0 },
    "edge-case": { passed: 0, failed: 0, skipped: 0 },
  };

  let passed = 0, failed = 0, skipped = 0, dryRun = 0;

  for (const r of results) {
    if (r.status === "passed") { passed++; bySeverity[r.severity].passed++; byCategory[r.category].passed++; }
    else if (r.status === "failed") { failed++; bySeverity[r.severity].failed++; byCategory[r.category].failed++; }
    else if (r.status === "skipped") { skipped++; byCategory[r.category].skipped++; }
    else if (r.status === "dry-run") { dryRun++; }
  }

  return {
    date: new Date().toISOString(),
    environment: QA_API_BASE,
    tenant: QA_CLIENT,
    qaCustomerEmail: QA_EMAIL,
    mode,
    total: results.length,
    passed,
    failed,
    skipped,
    dryRun,
    bySeverity,
    byCategory,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== Unboks QA Runner ===`);
  console.log(`Mode:      ${MODE}`);
  console.log(`Tenant:    ${QA_CLIENT}`);
  console.log(`API base:  ${QA_API_BASE}`);
  console.log(`QA email:  ${QA_EMAIL}`);
  if (onlyId) console.log(`Filter:    --only ${onlyId}`);
  if (categoryFilter) console.log(`Filter:    --category ${categoryFilter}`);
  console.log(``);

  const scenarios = loadScenarios();
  console.log(`Loaded ${scenarios.length} scenario(s).`);

  let snapshot: DashboardSnapshot | null = null;
  const missingEndpoints: string[] = [];
  const blockers: string[] = [];

  if (MODE === "live") {
    console.log(`\nFetching dashboard snapshot...`);
    try {
      snapshot = await buildSnapshot();
      console.log(`  inbox:         ${snapshot.inboxOk ? `OK (${snapshot.conversationCount})` : `FAIL - ${snapshot.inboxError}`}`);
      console.log(`  escalations:   ${snapshot.escalationsOk ? `OK (${snapshot.escalationCount})` : `FAIL - ${snapshot.escalationsError}`}`);
      console.log(`  appointments:  ${snapshot.appointmentsConnected ? `OK (${snapshot.appointmentCount})` : "not connected"}`);
      console.log(`  settings:      ${snapshot.configOk ? "OK" : `FAIL - ${snapshot.configError}`}`);
      console.log(`  alert settings:${snapshot.alertsOk ? "OK" : `FAIL - ${snapshot.alertsError}`}`);
      console.log(`  whatsapp:      ${snapshot.whatsappPresent ? `present (enabled=${snapshot.whatsappEnabled})` : "missing"}`);

      if (!snapshot.appointmentsConnected)
        missingEndpoints.push("/appointments — endpoint not yet connected");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      blockers.push(`Dashboard snapshot failed: ${msg}`);
      console.error(`\nFATAL: Could not fetch dashboard snapshot — ${msg}`);
      console.error(`Hint: Set QA_TOKEN to a valid bearer token from your browser session.`);
    }
  }

  console.log(`\nRunning scenarios...\n`);
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    const result = await runScenario(scenario, snapshot);
    const icon = result.status === "passed" ? "PASS" :
                 result.status === "failed" ? "FAIL" :
                 result.status === "dry-run" ? "DRY " : "SKIP";
    console.log(`  [${icon}] ${result.testId.padEnd(18)} ${scenario.description.slice(0, 55)}`);
    if (result.status === "failed" && result.error) {
      console.log(`         ERROR: ${result.error}`);
    }
    results.push(result);
  }

  const summary = buildSummary(results, MODE);
  const report: QAReport = { summary, results, missingEndpoints, blockers };

  console.log(`\n=== Summary ===`);
  console.log(`Total:    ${summary.total}`);
  console.log(`Passed:   ${summary.passed}`);
  console.log(`Failed:   ${summary.failed}`);
  console.log(`Skipped:  ${summary.skipped}`);
  console.log(`Dry-run:  ${summary.dryRun}`);

  if (missingEndpoints.length > 0) {
    console.log(`\nMissing endpoints:`);
    for (const ep of missingEndpoints) console.log(`  - ${ep}`);
  }
  if (blockers.length > 0) {
    console.log(`\nBlockers:`);
    for (const b of blockers) console.log(`  - ${b}`);
  }

  // Write reports
  const jsonStr = buildJsonReport(report);
  const mdStr = buildMarkdownReport(report);

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const baseDir = outDir ?? join(__dirname, "../../../reports");
  try {
    mkdirSync(baseDir, { recursive: true });
    const jsonPath = join(baseDir, `qa-report-${ts}.json`);
    const mdPath = join(baseDir, `qa-report-${ts}.md`);
    writeFileSync(jsonPath, jsonStr, "utf-8");
    writeFileSync(mdPath, mdStr, "utf-8");
    console.log(`\nReports written:`);
    console.log(`  JSON:     ${jsonPath}`);
    console.log(`  Markdown: ${mdPath}`);
  } catch (err) {
    console.warn(`\nWarning: could not write report files — ${err instanceof Error ? err.message : String(err)}`);
    console.log(`\n--- JSON REPORT ---\n${jsonStr.slice(0, 2000)}\n...`);
  }

  console.log(`\nDone.\n`);
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
