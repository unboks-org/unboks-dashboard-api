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

export function getTenantUiConfig(slug = getClientSlug()): TenantUiConfig {
  return slug === "consulta-despertares" ? DESPERTARES_UI : DEFAULT_UI;
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
