import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const DEFAULT_CLIENTS_ROOT = "/root/clients";

type ClientConfig = Record<string, unknown>;

export interface ClientAuthConfig {
  expectedPassword: string | null;
  source: "env" | "client-json" | "missing";
  configPath: string;
  fileExists: boolean;
  parsed: boolean;
  error?: string;
}

function clientsRoot(): string {
  return process.env.CLIENTS_ROOT || process.env.WTYJ_CLIENTS_ROOT || DEFAULT_CLIENTS_ROOT;
}

export function isSafeClientSlug(slug: string): boolean {
  return /^[A-Za-z0-9_-]{1,100}$/.test(slug);
}

export function clientConfigPath(slug: string): string {
  return path.join(clientsRoot(), slug, "config", "client.json");
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function passwordFromClientJson(config: ClientConfig): string | null {
  const auth = nestedRecord(config.auth);
  const dashboard = nestedRecord(config.dashboard);
  const dashboardAuth = nestedRecord(dashboard.auth);

  return firstString(
    config.dashboard_access_key,
    config.access_key,
    config.password,
    auth.dashboard_access_key,
    auth.access_key,
    auth.password,
    dashboard.access_key,
    dashboard.password,
    dashboardAuth.access_key,
    dashboardAuth.password,
  );
}

export async function getClientAuthConfig(slug: string): Promise<ClientAuthConfig> {
  const envKey = `${slug.toUpperCase().replace(/-/g, "_")}_PASSWORD`;
  const envPassword = process.env[envKey];
  const configPath = clientConfigPath(slug);

  if (envPassword) {
    return {
      expectedPassword: envPassword,
      source: "env",
      configPath,
      fileExists: false,
      parsed: false,
    };
  }

  try {
    await access(configPath, constants.R_OK);
  } catch {
    return {
      expectedPassword: null,
      source: "missing",
      configPath,
      fileExists: false,
      parsed: false,
      error: "client_json_not_readable",
    };
  }

  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as ClientConfig;
    const expectedPassword = passwordFromClientJson(parsed);

    return {
      expectedPassword,
      source: expectedPassword ? "client-json" : "missing",
      configPath,
      fileExists: true,
      parsed: true,
      error: expectedPassword ? undefined : "access_key_missing",
    };
  } catch {
    return {
      expectedPassword: null,
      source: "missing",
      configPath,
      fileExists: true,
      parsed: false,
      error: "client_json_parse_failed",
    };
  }
}
