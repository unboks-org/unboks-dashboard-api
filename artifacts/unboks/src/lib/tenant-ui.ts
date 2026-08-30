import { getClientSlug } from "@/lib/tenant";

export type TenantUiLocale = "en" | "es-ES";

export interface TenantUiConfig {
  locale: TenantUiLocale;
  dateLocale: string;
  followUpsLabel: string;
  conversationsLabel: string;
  escalationsLabel: string;
  settingsLabel: string;
}

const DEFAULT_UI: TenantUiConfig = {
  locale: "en",
  dateLocale: "en",
  followUpsLabel: "Follow-ups",
  conversationsLabel: "Conversations",
  escalationsLabel: "Escalations",
  settingsLabel: "Settings",
};

const DESPERTARES_UI: TenantUiConfig = {
  locale: "es-ES",
  dateLocale: "es-ES",
  followUpsLabel: "Seguimientos",
  conversationsLabel: "Conversaciones",
  escalationsLabel: "Escalaciones",
  settingsLabel: "Configuración",
};

const ALI_RENTAL_UI: TenantUiConfig = {
  locale: "en",
  dateLocale: "en-CW",
  followUpsLabel: "Quote leads",
  conversationsLabel: "Conversations",
  escalationsLabel: "Escalations",
  settingsLabel: "Settings",
};

export function getTenantUiConfig(slug = getClientSlug()): TenantUiConfig {
  if (slug === "consulta-despertares") return DESPERTARES_UI;
  if (slug === "ali-car-rental") return ALI_RENTAL_UI;
  return DEFAULT_UI;
}

export function isAliRentalTenant(slug = getClientSlug()): boolean {
  return slug === "ali-car-rental";
}

/**
 * Rental Dashboard V2 rollout gate. Keep this tenant-scoped so the premium
 * rental shell cannot leak into medical or general-purpose workspaces. New
 * rental tenants are added only after their workflow configuration is ready.
 */
export function isRentalDashboardV2Enabled(slug = getClientSlug()): boolean {
  return slug === "ali-car-rental";
}

export function isSpainSpanishTenant(slug = getClientSlug()): boolean {
  return getTenantUiConfig(slug).locale === "es-ES";
}

/**
 * Keeps tenant-specific wording beside the generic wording while the locale
 * decision remains centralized in getTenantUiConfig().
 */
export function tenantText(english: string, spanish: string): string {
  return isSpainSpanishTenant() ? spanish : english;
}
