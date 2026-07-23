import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { resolveCenterViaNominatim } from "@/server/lib/geocode";
import type { LeadDiscovery, LeadDiscoveryQuery, DiscoveredLead } from "@/server/ports";

/**
 * Geoapify Places API (free: 3,000 credits/day, no card) — constructed only
 * when GEOAPIFY_API_KEY is configured. Same underlying OpenStreetMap data as
 * the primary Overpass source, but a real hosted API with better uptime than
 * the public Overpass mirrors — wired in as a FREE fallback to top up
 * sparse Overpass results, tried before the paid Google Places last resort
 * (see fallback.lead-discovery.ts / container.ts).
 */
const GEOAPIFY_PLACES_ENDPOINT = "https://api.geoapify.com/v2/places";

/** category → Geoapify Places category. Best-effort map; unknown categories
 *  fall back to the broad "commercial" category so something plausible still
 *  comes back rather than nothing. */
const CATEGORY_MAP: Record<string, string> = {
  restaurant: "catering.restaurant",
  cafe: "catering.cafe",
  bar: "catering.bar",
  bakery: "commercial.food_and_drink.bakery",
  dentist: "healthcare.dentist",
  doctor: "healthcare.clinic_or_praxis",
  clinic: "healthcare.clinic_or_praxis",
  pharmacy: "healthcare.pharmacy",
  veterinary: "commercial.pet",
  gym: "sport.fitness.fitness_centre",
  spa: "leisure.spa",
  salon: "commercial.hairdresser_beautysalon",
  hotel: "accommodation.hotel",
  lawyer: "office.lawyer",
  accountant: "office.company",
  real_estate: "office.estate_agent",
  plumber: "commercial.craft",
  electrician: "commercial.craft",
  auto_repair: "service.vehicle",
};

function categoryFor(category: string): string {
  const key = category.trim().toLowerCase().replace(/\s+/g, "_");
  return CATEGORY_MAP[key] ?? "commercial";
}

interface GeoapifyFeature {
  properties: {
    place_id: string;
    name?: string;
    categories?: string[];
    formatted?: string;
    website?: string;
    contact?: { phone?: string; email?: string };
    lat?: number;
    lon?: number;
  };
}

function featureToLead(f: GeoapifyFeature): DiscoveredLead | null {
  const p = f.properties;
  if (!p.name) return null; // unnamed POIs aren't usable leads
  return {
    sourcePlaceId: `geoapify:${p.place_id}`,
    name: p.name,
    category: p.categories?.[0],
    address: p.formatted,
    phone: p.contact?.phone,
    website: p.website,
    email: p.contact?.email,
    lat: p.lat,
    lon: p.lon,
  };
}

export class GeoapifyLeadDiscovery implements LeadDiscovery {
  private apiKey: string;

  constructor() {
    const key = getEnv().GEOAPIFY_API_KEY;
    if (!key) throw new Error("GEOAPIFY_API_KEY is required for GeoapifyLeadDiscovery");
    this.apiKey = key;
  }

  async discover(query: LeadDiscoveryQuery): Promise<DiscoveredLead[]> {
    const center = await this.resolveCenter(query.location);
    if (!center) return [];
    const radius = "radiusMeters" in query.location ? query.location.radiusMeters : 10_000;

    const params = new URLSearchParams({
      categories: categoryFor(query.category),
      filter: `circle:${center.lon},${center.lat},${radius}`,
      bias: `proximity:${center.lon},${center.lat}`,
      limit: String(query.limit),
      apiKey: this.apiKey,
    });

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(`${GEOAPIFY_PLACES_ENDPOINT}?${params.toString()}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        logger.warn({ status: res.status }, "geoapify_discover_non_ok");
        return [];
      }
      const data = (await res.json()) as { features?: GeoapifyFeature[] };
      const leads: DiscoveredLead[] = [];
      for (const f of data.features ?? []) {
        const lead = featureToLead(f);
        if (lead) leads.push(lead);
      }
      return leads;
    } catch (err) {
      logger.warn({ err }, "geoapify_discover_failed");
      return [];
    }
  }

  private async resolveCenter(
    location: LeadDiscoveryQuery["location"],
  ): Promise<{ lat: number; lon: number } | null> {
    if ("lat" in location) return { lat: location.lat, lon: location.lon };
    return resolveCenterViaNominatim(location.text);
  }
}
