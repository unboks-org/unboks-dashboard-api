const tenant = process.env.DASHBOARD_SMOKE_TENANT ?? "unboks";
const password = process.env.DASHBOARD_SMOKE_PASSWORD ?? "";
const apiHost = process.env.DASHBOARD_SMOKE_API_HOST ?? "https://api.unboks.org";
const dashboardUrl = process.env.DASHBOARD_SMOKE_DASHBOARD_URL ?? "https://dashboard.unboks.org";

const apiBase = `${apiHost.replace(/\/$/u, "")}/api/${encodeURIComponent(tenant)}/dashboard/api`;

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  const mark = ok ? "OK" : "FAIL";
  console.log(`${mark} ${name}: ${detail}`);
}

async function fetchJson(path: string, token: string) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 160);
    }
  }
  return { res, body };
}

async function main() {
  const shell = await fetch(dashboardUrl, { redirect: "manual" });
  record("dashboard shell", shell.ok, `${shell.status} ${dashboardUrl}`);

  if (!password) {
    record(
      "authenticated checks",
      true,
      "skipped, set DASHBOARD_SMOKE_PASSWORD to verify login/API endpoints",
    );
    printSummary();
    return;
  }

  const loginRes = await fetch(`${apiBase}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const loginText = await loginRes.text();
  let token = "";
  if (loginText) {
    try {
      const body = JSON.parse(loginText) as { token?: unknown };
      token = typeof body.token === "string" ? body.token : "";
    } catch {
      // handled below
    }
  }
  record("login", loginRes.ok && Boolean(token), `${loginRes.status} token=${token ? "present" : "missing"}`);

  if (!token) {
    printSummary();
    process.exitCode = 1;
    return;
  }

  const endpointChecks: Array<{
    name: string;
    path: string;
    validate: (body: unknown) => boolean;
  }> = [
    {
      name: "conversations",
      path: "/messages/conversations",
      validate: Array.isArray,
    },
    {
      name: "source of truth",
      path: "/source-of-truth",
      validate: (body) =>
        Array.isArray(body) ||
        (Boolean(body) &&
          typeof body === "object" &&
          Array.isArray((body as { blocks?: unknown }).blocks)),
    },
    {
      name: "knowledge files",
      path: "/knowledge/files",
      validate: Array.isArray,
    },
    {
      name: "archived conversations",
      path: "/messages/conversations/archived",
      validate: Array.isArray,
    },
    {
      name: "appointments",
      path: "/appointments",
      validate: (body) =>
        Boolean(body) &&
        typeof body === "object" &&
        Array.isArray((body as { items?: unknown }).items),
    },
    {
      name: "workspace settings",
      path: "/settings/your-info",
      validate: (body) => Boolean(body) && typeof body === "object" && !Array.isArray(body),
    },
  ];

  for (const check of endpointChecks) {
    const { res, body } = await fetchJson(check.path, token);
    record(check.name, res.ok && check.validate(body), `${res.status} ${check.path}`);
  }

  printSummary();
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

function printSummary() {
  const failed = results.filter((r) => !r.ok);
  console.log("");
  console.log(`Dashboard smoke: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`- ${f.name}: ${f.detail}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
