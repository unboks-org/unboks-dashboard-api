import { useRef } from "react";
import { getClientSlug } from "@/lib/tenant";

/** One identity per logical send; an uncertain retry retains the identity. */
export function useOperatorRequestId() {
  const attempt = useRef<{ signature: string; id: string } | null>(null);

  return {
    forAttempt(conversationId: string, message: string, mediaId?: string) {
      const signature = JSON.stringify([
        getClientSlug(),
        conversationId,
        message,
        mediaId ?? null,
      ]);
      if (attempt.current?.signature !== signature) {
        attempt.current = { signature, id: crypto.randomUUID() };
      }
      return attempt.current.id;
    },
    complete(requestId: string) {
      if (attempt.current?.id === requestId) attempt.current = null;
    },
  };
}
