const PRODUCTION_ALLOW_FLAG = "ALLOW_LEGACY_TS_API_SERVER_PRODUCTION";

function isProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

function requireEnv(name: string): void {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required in production.`);
  }
}

export function assertRuntimeCanStart(): void {
  if (!isProduction()) {
    return;
  }

  if (process.env[PRODUCTION_ALLOW_FLAG] !== "true") {
    throw new Error(
      [
        "Refusing to start artifacts/api-server in production.",
        "This TypeScript API server is not the canonical Nr2 production backend.",
        "Set ALLOW_LEGACY_TS_API_SERVER_PRODUCTION=true only for an explicitly approved migration/staging run.",
      ].join(" "),
    );
  }

  requireEnv("SESSION_SECRET");
  requireEnv("ZERNIO_SIGNING_SECRET");
}
