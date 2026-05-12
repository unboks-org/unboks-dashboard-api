import type { ConfigResponse } from "@/lib/api";

function readBool(source: unknown, keys: string[]): boolean | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

export function shouldShowInlineLearningConfirmation(
  config: ConfigResponse | undefined,
): boolean {
  const features = config?.features;
  const showInline =
    readBool(features, [
      "showInlineLearningConfirmationAfterReplies",
      "showSuggestionAfterReplies",
      "show_learning_suggestion_after_replies",
    ]) ??
    readBool(config, [
      "showInlineLearningConfirmationAfterReplies",
      "showSuggestionAfterReplies",
      "show_learning_suggestion_after_replies",
    ]);
  const createPending =
    readBool(features, [
      "createPendingLearningFromOperatorReplies",
      "create_pending_learning_from_operator_replies",
    ]) ??
    readBool(config, [
      "createPendingLearningFromOperatorReplies",
      "create_pending_learning_from_operator_replies",
    ]);

  return showInline === true && createPending === true;
}

export function openPendingLearnings() {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const path = `${base}/settings?section=your-info&focus=pending-learning`;
  window.location.assign(path.startsWith("/") ? path : `/${path}`);
}
