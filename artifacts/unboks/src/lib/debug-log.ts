export const DEBUG_LOGS_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_LOGS === "true";

export function debugLog(...args: unknown[]) {
  if (!DEBUG_LOGS_ENABLED) return;
  console.log(...args);
}

export function debugInfo(...args: unknown[]) {
  if (!DEBUG_LOGS_ENABLED) return;
  console.info(...args);
}

export function debugWarn(...args: unknown[]) {
  if (!DEBUG_LOGS_ENABLED) return;
  console.warn(...args);
}
