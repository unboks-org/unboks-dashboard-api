import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { createToken } from "../lib/auth.js";
import { getClientAuthConfig, isSafeClientSlug } from "../lib/client-config.js";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * POST /api/:client/dashboard/api/login
 * Body: { password: string }
 * Returns: { token: string }
 *
 * Client passwords are read from env vars first:
 *   UNBOKS_PASSWORD, BLUEMARLIN_PASSWORD, ADAMUS_PASSWORD, etc.
 *
 * New tenants can be added without rebuilding by placing:
 *   /root/clients/{slug}/config/client.json
 *
 * Accepted client.json auth fields, in priority order:
 *   dashboard_access_key, access_key, password,
 *   auth.dashboard_access_key, auth.access_key, auth.password,
 *   dashboard.access_key, dashboard.password,
 *   dashboard.auth.access_key, dashboard.auth.password
 */
router.post("/:client/dashboard/api/login", async (req, res) => {
  const { client } = req.params;
  const { password } = req.body as { password?: string };

  if (!isSafeClientSlug(client)) {
    res.status(404).json({ detail: "Client not found" });
    return;
  }

  if (!password) {
    res.status(400).json({ detail: "Password required" });
    return;
  }

  const authConfig = await getClientAuthConfig(client);

  if (!authConfig.expectedPassword || !passwordMatches(password, authConfig.expectedPassword)) {
    logger.warn(
      {
        client,
        authSource: authConfig.source,
        configPath: authConfig.configPath,
        fileExists: authConfig.fileExists,
        parsed: authConfig.parsed,
        authError: authConfig.error,
      },
      "dashboard login rejected",
    );
    res.status(401).json({ detail: "Wrong password" });
    return;
  }

  const token = createToken(client);
  res.json({ token });
});

/**
 * GET /api/:client/dashboard/api/internal/tenant-auth-debug
 *
 * Protected by DASHBOARD_INTERNAL_DEBUG_TOKEN and intended for operational
 * diagnostics only. It never returns passwords or access keys.
 */
router.get("/:client/dashboard/api/internal/tenant-auth-debug", async (req, res) => {
  const debugToken = process.env.DASHBOARD_INTERNAL_DEBUG_TOKEN;
  const suppliedToken = req.header("x-internal-debug-token");

  if (!debugToken || !suppliedToken || !passwordMatches(suppliedToken, debugToken)) {
    res.status(404).json({ detail: "Not found" });
    return;
  }

  const { client } = req.params;
  if (!isSafeClientSlug(client)) {
    res.status(400).json({ detail: "Invalid client slug" });
    return;
  }

  const authConfig = await getClientAuthConfig(client);
  res.json({
    client,
    configPath: authConfig.configPath,
    fileExists: authConfig.fileExists,
    parsed: authConfig.parsed,
    authSource: authConfig.source,
    hasExpectedAccessKey: Boolean(authConfig.expectedPassword),
    error: authConfig.error ?? null,
    acceptedClientJsonFields: [
      "dashboard_access_key",
      "access_key",
      "password",
      "auth.dashboard_access_key",
      "auth.access_key",
      "auth.password",
      "dashboard.access_key",
      "dashboard.password",
      "dashboard.auth.access_key",
      "dashboard.auth.password",
    ],
  });
});

function passwordMatches(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export default router;
