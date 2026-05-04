import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { logger } from "./logger.js";

/**
 * Returns the Zernio signature from request headers.
 * Zernio may use x-zernio-signature, x-hub-signature-256, or x-signature.
 */
export function extractSignatureHeader(headers: IncomingHttpHeaders): string | undefined {
  return (
    (headers["x-zernio-signature"] as string | undefined) ??
    (headers["x-hub-signature-256"] as string | undefined) ??
    (headers["x-signature"] as string | undefined)
  );
}

/**
 * Returns the name of whichever signature header was found (for logging only).
 */
export function whichSignatureHeader(headers: IncomingHttpHeaders): string {
  if (headers["x-zernio-signature"]) return "x-zernio-signature";
  if (headers["x-hub-signature-256"]) return "x-hub-signature-256";
  if (headers["x-signature"]) return "x-signature";
  return "(none)";
}

/**
 * Verifies the Zernio HMAC-SHA256 webhook signature against the raw request body.
 *
 * - If ZERNIO_SIGNING_SECRET is not set, skips verification (logs a warning).
 * - Expected header format: "sha256=<hex-digest>"
 */
export function verifyZernioSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  const secret = process.env.ZERNIO_SIGNING_SECRET;

  if (!secret) {
    logger.warn(
      "ZERNIO_SIGNING_SECRET is not set — skipping webhook signature verification. " +
        "Set this env var to enable security.",
    );
    return true;
  }

  if (!signatureHeader) {
    logger.warn("Zernio webhook request has no signature header");
    return false;
  }

  // Expected format: "sha256=<hex>"
  const eqIdx = signatureHeader.indexOf("=");
  if (eqIdx === -1) return false;
  const algo = signatureHeader.slice(0, eqIdx);
  const receivedHex = signatureHeader.slice(eqIdx + 1);

  if (algo !== "sha256") {
    logger.warn({ algo }, "Zernio signature uses unexpected algorithm");
    return false;
  }

  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    const a = Buffer.from(receivedHex.padEnd(expectedHex.length, "0"), "hex");
    const b = Buffer.from(expectedHex.padEnd(receivedHex.length, "0"), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
