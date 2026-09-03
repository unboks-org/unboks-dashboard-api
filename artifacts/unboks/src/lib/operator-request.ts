import { ApiError } from "@/lib/error";
import { getClientSlug } from "@/lib/tenant";

const PREFIX = "unboks:operator-request:v1:";
const inFlight = new Map<string, Promise<unknown>>();

/** Persist only an opaque payload fingerprint and UUID, never message text.
 * Session storage survives reloads but deliberately does not combine separate
 * operators/tabs into one logical send. Pending identities never expire silently.
 */
export async function withOperatorRequest<T>(
  action: string,
  payload: Record<string, unknown>,
  send: (requestId: string) => Promise<T>,
  preferredId?: string,
): Promise<T> {
  const tenant = getClientSlug();
  const canonical = Object.fromEntries(
    Object.entries(payload)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  // Reserve the in-memory flight before hashing: digest is asynchronous, so
  // waiting first would allow two rapid clicks to dispatch separate sends.
  const signature = JSON.stringify([tenant, action, canonical]);
  const existing = inFlight.get(signature);
  if (existing) return existing as Promise<T>;
  const pending = (async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(signature),
    );
    const key =
      PREFIX +
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    if (getClientSlug() !== tenant)
      throw new ApiError(
        409,
        "Workspace changed before sending. Reopen the conversation.",
      );
    let requestId: string;
    try {
      const stored = sessionStorage.getItem(key);
      requestId = stored ?? preferredId ?? crypto.randomUUID();
      if (!requestId || requestId.length > 128 || /[\x00-\x1f]/.test(requestId))
        throw new Error("Invalid pending request identity");
      sessionStorage.setItem(key, requestId);
      if (sessionStorage.getItem(key) !== requestId)
        throw new Error("Retry identity was not persisted");
    } catch {
      throw new ApiError(
        409,
        "Safe retry storage is unavailable. Allow website storage before sending.",
      );
    }

    const result = await send(requestId);
    if (
      !(
        result &&
        typeof result === "object" &&
        "ok" in result &&
        result.ok === true
      )
    ) {
      throw new ApiError(
        502,
        "Message delivery was not confirmed. Retry the same request.",
      );
    }
    // HTTP/JSON errors never reach this point. Keep the identity until the
    // backend has acknowledged success, including an idempotent replay.
    if (sessionStorage.getItem(key) === requestId)
      sessionStorage.removeItem(key);
    return result;
  })();
  inFlight.set(signature, pending);
  try {
    return await pending;
  } finally {
    if (inFlight.get(signature) === pending) inFlight.delete(signature);
  }
}
