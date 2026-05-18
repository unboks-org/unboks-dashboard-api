import { ApiError } from "@/lib/error";
import { getApiBase, getToken, clearToken } from "@/lib/tenant";
import { formatConversationTimestamp, parseTimestampMs } from "@/lib/conversation-mapper";

// Tenant slug validation (permissive for ICP-created tenants)
const TENANT_SLUG_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export function isValidTenantSlug(slug: string | null | undefined): boolean {
  if (!slug || typeof slug !== "string") return false;
  return TENANT_SLUG_PATTERN.test(slug);
}

export type ValidClient = string;
