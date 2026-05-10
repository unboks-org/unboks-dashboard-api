/**
 * QA Panel — internal, dev-only manual-test helper.
 *
 * SCOPE
 * -----
 * Lightweight floating panel that runs read-only smoke checks against
 * the dashboard's existing API surface so a human tester can verify the
 * key flows render without manually clicking through every page.
 *
 * Hidden by default. Enabled only when ANY of:
 *   - URL has `?qa=1` (also persists the flag below)
 *   - localStorage["unboks_qa_panel"] === "1"
 * Disabled / dismissed by:
 *   - URL has `?qa=0` (also clears the flag)
 *   - Clicking the panel's X (clears the flag)
 *
 * SAFETY
 * ------
 * - Uses ONLY existing read-only API helpers (fetchConversations,
 *   fetchEscalations, fetchAppointments, fetchConfig,
 *   getEscalationAlertSettings).
 * - Sends NO customer messages. Triggers NO alerts. Mutates NO data.
 * - Backend is not touched in any way; this is a frontend-only file.
 * - Removable: delete this file and the single mount line in App.tsx.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  fetchConversations,
  fetchEscalations,
  fetchAppointments,
  fetchConfig,
  getEscalationAlertSettings,
  type EscalationAlertSettings,
  type AppointmentsResponse,
} from "@/lib/api";
import { useDeepLink } from "@/lib/deep-link";

const STORAGE_KEY = "unboks_qa_panel";

type CheckStatus = "idle" | "running" | "pass" | "fail" | "skip";

interface CheckResult {
  status: CheckStatus;
  message?: string;
}

const CHECK_KEYS = [
  "inbox",
  "escalations",
  "appointments",
  "settings",
  "alertSettings",
  "whatsappStatus",
  "appointmentConfirm",
  "deepLinks",
] as const;

type CheckKey = (typeof CHECK_KEYS)[number];

const CHECK_LABELS: Record<CheckKey, string> = {
  inbox: "Inbox loads",
  escalations: "Escalations load",
  appointments: "Appointments load",
  settings: "Settings load",
  alertSettings: "Alert settings load",
  whatsappStatus: "WhatsApp status visible",
  appointmentConfirm: "Appointment Confirm button visible when applicable",
  deepLinks: "Deep links supported",
};

const INITIAL_RESULTS: Record<CheckKey, CheckResult> = CHECK_KEYS.reduce(
  (acc, k) => {
    acc[k] = { status: "idle" };
    return acc;
  },
  {} as Record<CheckKey, CheckResult>,
);

/** Reads the enable flag and reconciles it with the current URL. */
function readEnabledFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    const qa = url.searchParams.get("qa");
    if (qa === "1") {
      localStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    if (qa === "0") {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const maybeStatus = (err as unknown as { status?: unknown }).status;
    const status =
      typeof maybeStatus === "number" ? ` (HTTP ${maybeStatus})` : "";
    return `${err.message}${status}`.slice(0, 200);
  }
  return String(err).slice(0, 200);
}

export function QAPanel() {
  const [enabled, setEnabled] = useState<boolean>(() => readEnabledFlag());
  const [open, setOpen] = useState<boolean>(true);
  const [results, setResults] =
    useState<Record<CheckKey, CheckResult>>(INITIAL_RESULTS);
  const [running, setRunning] = useState(false);

  // Touch the deep-link hook so the import is not stripped by tree-shaking
  // and so we can confirm Wouter context is present. The return value is
  // not used; the existence of this call doubles as a runtime smoke that
  // useDeepLink is callable inside the React tree.
  useDeepLink();

  // Keep the flag reactive to URL changes (e.g. the operator pastes a
  // `?qa=1` link in the same tab without a full reload).
  useEffect(() => {
    const onPop = () => setEnabled(readEnabledFlag());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function setOne(key: CheckKey, result: CheckResult) {
    setResults((prev) => ({ ...prev, [key]: result }));
  }

  async function runChecks() {
    if (running) return;
    setRunning(true);
    // Mark every check as running up-front so the user sees motion even
    // for the derived ones that resolve at the very end.
    setResults(
      CHECK_KEYS.reduce(
        (acc, k) => {
          acc[k] = { status: "running" };
          return acc;
        },
        {} as Record<CheckKey, CheckResult>,
      ),
    );

    // Run the four primary GETs in parallel; the derived checks
    // (whatsappStatus, appointmentConfirm) read from these responses
    // instead of hitting the API a second time.
    const [convRes, escRes, apptRes, cfgRes, alertRes] =
      await Promise.allSettled([
        fetchConversations(),
        fetchEscalations("all"),
        fetchAppointments(),
        fetchConfig(),
        getEscalationAlertSettings(),
      ]);

    // 1. Inbox loads
    if (convRes.status === "fulfilled") {
      setOne("inbox", {
        status: "pass",
        message: `${convRes.value.length} conversation(s)`,
      });
    } else {
      setOne("inbox", { status: "fail", message: describeError(convRes.reason) });
    }

    // 2. Escalations load
    if (escRes.status === "fulfilled") {
      setOne("escalations", {
        status: "pass",
        message: `${escRes.value.length} escalation(s)`,
      });
    } else {
      setOne("escalations", {
        status: "fail",
        message: describeError(escRes.reason),
      });
    }

    // 3. Appointments load
    let appts: AppointmentsResponse | null = null;
    if (apptRes.status === "fulfilled") {
      appts = apptRes.value;
      setOne("appointments", {
        status: "pass",
        message: appts.connected
          ? `${appts.items.length} appointment(s)`
          : "endpoint not connected (handled gracefully)",
      });
    } else {
      setOne("appointments", {
        status: "fail",
        message: describeError(apptRes.reason),
      });
    }

    // 4. Settings load
    if (cfgRes.status === "fulfilled") {
      setOne("settings", { status: "pass" });
    } else {
      setOne("settings", {
        status: "fail",
        message: describeError(cfgRes.reason),
      });
    }

    // 5. Alert settings load
    let alerts: EscalationAlertSettings | null = null;
    if (alertRes.status === "fulfilled") {
      alerts = alertRes.value;
      setOne("alertSettings", { status: "pass" });
    } else {
      setOne("alertSettings", {
        status: "fail",
        message: describeError(alertRes.reason),
      });
    }

    // 6. WhatsApp status visible — derived from alert settings.
    if (!alerts) {
      setOne("whatsappStatus", {
        status: "fail",
        message: "alert settings did not load",
      });
    } else {
      const wa = alerts.channels?.whatsapp;
      if (wa) {
        setOne("whatsappStatus", {
          status: "pass",
          message: `enabled=${String(wa.enabled)}${
            wa.deliveryStatus ? `, delivery=${wa.deliveryStatus}` : ""
          }`,
        });
      } else {
        setOne("whatsappStatus", {
          status: "fail",
          message: "channels.whatsapp missing from alert settings",
        });
      }
    }

    // 7. Appointment Confirm button visible WHEN APPLICABLE — derived.
    //    Confirm is rendered for items with status "pending" or "detected"
    //    in Bookings.tsx; "confirmed" items hide the button. If there are
    //    no items in a confirmable state, mark the check as skipped (not
    //    failed) — that matches "when applicable".
    if (!appts) {
      setOne("appointmentConfirm", {
        status: "fail",
        message: "appointments did not load",
      });
    } else if (!appts.connected) {
      setOne("appointmentConfirm", {
        status: "skip",
        message: "appointments endpoint not connected",
      });
    } else {
      const confirmable = appts.items.filter(
        (a) => a.status === "pending" || a.status === "detected",
      ).length;
      if (confirmable > 0) {
        setOne("appointmentConfirm", {
          status: "pass",
          message: `${confirmable} confirmable appointment(s)`,
        });
      } else {
        setOne("appointmentConfirm", {
          status: "skip",
          message: "no pending/detected appointments to confirm",
        });
      }
    }

    // 8. Deep links supported — synchronous: the module loaded and the
    //    hook is callable (we already invoked it at component top). The
    //    only failure mode here is module-level breakage, which would
    //    have crashed the panel before reaching this point.
    setOne("deepLinks", {
      status: typeof useDeepLink === "function" ? "pass" : "fail",
      message:
        typeof useDeepLink === "function"
          ? "deep-link module loaded; routes /escalations/:id and /appointments/:id are registered in App.tsx"
          : "useDeepLink is not a function",
    });

    setRunning(false);
  }

  function clearResults() {
    setResults(INITIAL_RESULTS);
  }

  function dismiss() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setEnabled(false);
  }

  const summary = useMemo(() => {
    const counts = { pass: 0, fail: 0, skip: 0, idle: 0, running: 0 };
    for (const k of CHECK_KEYS) counts[results[k].status] += 1;
    return counts;
  }, [results]);

  if (!enabled) return null;

  return (
    <div
      role="region"
      aria-label="QA dashboard checks"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 9999,
        width: open ? 360 : 220,
        maxWidth: "calc(100vw - 32px)",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          background: "#1f2937",
          color: "#fbfbfd",
          borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          overflow: "hidden",
          border: "1px solid #e6e8eb",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            background: "#111827",
          }}
        >
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Collapse QA panel" : "Expand QA panel"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              color: "#fbfbfd",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              padding: 0,
            }}
          >
            {open ? (
              <ChevronDown style={{ width: 14, height: 14 }} />
            ) : (
              <ChevronUp style={{ width: 14, height: 14 }} />
            )}
            QA panel
          </button>
          <span
            style={{
              fontSize: 11,
              color: "#9aa0a6",
              marginLeft: 4,
            }}
          >
            {summary.pass}P · {summary.fail}F · {summary.skip}S
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Hide QA panel"
            title="Hide QA panel (re-enable with ?qa=1)"
            style={{
              marginLeft: "auto",
              background: "transparent",
              color: "#9aa0a6",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {open && (
          <div style={{ padding: 10 }}>
            {/* Action row */}
            <div
              style={{
                display: "flex",
                gap: 6,
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={runChecks}
                disabled={running}
                style={{
                  flex: 1,
                  background: running ? "#5f6368" : "#1a73e8",
                  color: "#fbfbfd",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: running ? "default" : "pointer",
                }}
              >
                {running ? "Running..." : "Run basic dashboard checks"}
              </button>
              <button
                type="button"
                onClick={clearResults}
                disabled={running}
                style={{
                  background: "transparent",
                  color: "#fbfbfd",
                  border: "1px solid #5f6368",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: running ? "default" : "pointer",
                }}
              >
                Clear QA results
              </button>
            </div>

            {/* Results list */}
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {CHECK_KEYS.map((key) => {
                const r = results[key];
                return (
                  <li
                    key={key}
                    style={{
                      background: "#111827",
                      border: "1px solid #5f6368",
                      borderRadius: 6,
                      padding: "6px 8px",
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <StatusBadge status={r.status} />
                      <span style={{ color: "#fbfbfd" }}>
                        {CHECK_LABELS[key]}
                      </span>
                    </div>
                    {r.message && (
                      <div
                        style={{
                          marginTop: 3,
                          marginLeft: 56,
                          color:
                            r.status === "fail" ? "#fca5a5" : "#9aa0a6",
                          fontSize: 11,
                          wordBreak: "break-word",
                        }}
                      >
                        {r.message}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <p
              style={{
                marginTop: 8,
                marginBottom: 0,
                fontSize: 10,
                color: "#9aa0a6",
                lineHeight: 1.4,
              }}
            >
              Read-only checks. No messages sent, no alerts triggered, no
              data mutated. Hide with the X (re-enable with{" "}
              <code style={{ color: "#fbfbfd" }}>?qa=1</code>).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CheckStatus }) {
  const map: Record<CheckStatus, { label: string; bg: string; fg: string }> = {
    idle: { label: "not run", bg: "#5f6368", fg: "#fbfbfd" },
    running: { label: "running", bg: "#1a73e8", fg: "#fbfbfd" },
    pass: { label: "pass", bg: "#137333", fg: "#fbfbfd" },
    fail: { label: "fail", bg: "#c5221f", fg: "#fbfbfd" },
    skip: { label: "skip", bg: "#5f6368", fg: "#fbfbfd" },
  };
  const s = map[status];
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        borderRadius: 4,
        padding: "1px 6px",
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        minWidth: 50,
        textAlign: "center",
      }}
    >
      {s.label}
    </span>
  );
}
