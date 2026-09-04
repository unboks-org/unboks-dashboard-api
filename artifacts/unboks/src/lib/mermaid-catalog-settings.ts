import type { MermaidCatalogChanges, MermaidCatalogResponse } from "@/lib/api";

// Send only operator-owned fields. Never echo templates, URLs, tenant identity,
// feature flags or server versions back as editable configuration.
export function editableMermaidCatalog(
  catalog: MermaidCatalogResponse["catalog"],
): MermaidCatalogChanges {
  const { service: s, pricing: p, policies } = catalog;
  return {
    service: {
      name: s.name,
      meeting_point: s.meeting_point,
      operating_weekdays: [...s.operating_weekdays],
      arrival_time: s.arrival_time,
      island_departure_time: s.island_departure_time,
      pickup_minutes_before_arrival: s.pickup_minutes_before_arrival,
    },
    pricing: {
      currencies: structuredClone(p.currencies),
      default_currency: p.default_currency,
      ...(p.pickup_vehicles
        ? {
            pickup_vehicles: structuredClone(p.pickup_vehicles),
            pickup_overflow: p.pickup_overflow,
          }
        : { pickup_price: p.pickup_price ?? null }),
      ...(p.pickup_currency ? { pickup_currency: p.pickup_currency } : {}),
    },
    included: [...catalog.included],
    bring: [...catalog.bring],
    extras: (catalog.extras ?? []).filter(
      (text) =>
        !text.startsWith("Optional island-wide pickup:") &&
        !text.startsWith("Optional pickup:"),
    ),
    policies: {
      cancellation: policies.cancellation,
      safety: policies.safety,
      insurance: policies.insurance,
    },
  };
}

export function mermaidCatalogProblem(
  draft: MermaidCatalogChanges,
): string | null {
  const s = draft.service;
  if (!s.operating_weekdays.length) return "Select at least one operating day.";
  if (s.arrival_time >= s.island_departure_time)
    return "Return boarding must be after arrival/check-in.";
  const [hours, minutes] = s.arrival_time.split(":").map(Number);
  if (
    !Number.isInteger(s.pickup_minutes_before_arrival) ||
    s.pickup_minutes_before_arrival! < 1 ||
    s.pickup_minutes_before_arrival! > hours * 60 + minutes
  ) {
    return "Pickup must be before check-in on the same day.";
  }
  const vehicles = draft.pricing.pickup_vehicles;
  if (
    (vehicles || draft.pricing.pickup_price != null) &&
    draft.pricing.default_currency !== draft.pricing.pickup_currency
  )
    return "Default quote currency and pickup currency must match; pickup conversion rates are not configured.";
  if (vehicles && vehicles[0].capacity >= vehicles[1].capacity)
    return "Van capacity must be greater than car capacity.";
  for (const key of ["cancellation", "safety"] as const) {
    if (!draft.policies[key].includes("DEMO POLICY - REPLACE BEFORE GO-LIVE"))
      return `Keep the demo marker in the ${key} policy while real bookings are not enabled.`;
  }
  if (!draft.policies.insurance.toLowerCase().includes("not verified"))
    return "Insurance must remain marked as not verified until separately approved for go-live.";
  return null;
}
