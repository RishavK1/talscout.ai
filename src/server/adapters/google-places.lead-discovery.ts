import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import type { LeadDiscovery, LeadDiscoveryQuery, DiscoveredLead } from "@/server/ports";

/**
 * Optional last-resort fallback lead source — constructed ONLY when
 * GOOGLE_PLACES_API_KEY is configured (see container.ts). This is NOT free:
 * Google requires a billing account on the project and bills past a small
 * per-SKU free monthly threshold. The user explicitly accepted this
 * tradeoff for a fallback they will wire up with their own key later; until
 * that key exists this class is never imported/constructed/called anywhere
 * in the live code path (see fallback.lead-discovery.ts).
 *
 * Known limitation: Nearby Search doesn't return website/phone without a
 * separate (also billed) Place Details call, so Google-sourced leads often
 * have no `website` — the email-finder waterfall's site-scrape step then has
 * nothing to scrape for them. Acceptable for a last-resort fallback; not
 * extended with extra billed calls in this pass.
 */

const NEARBY_SEARCH_ENDPOINT = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";

interface GooglePlaceResult {
  place_id: string;
  name: string;
  vicinity?: string;
  geometry?: { location?: { lat: number; lng: number } };
  types?: string[];
}

function resultToLead(r: GooglePlaceResult): DiscoveredLead {
  return {
    sourcePlaceId: `google:${r.place_id}`,
    name: r.name,
    category: r.types?.[0],
    address: r.vicinity,
    lat: r.geometry?.location?.lat,
    lon: r.geometry?.location?.lng,
  };
}

export class GooglePlacesLeadDiscovery implements LeadDiscovery {
  private apiKey: string;

  constructor() {
    const key = getEnv().GOOGLE_PLACES_API_KEY;
    if (!key) {
      throw new Error("GOOGLE_PLACES_API_KEY is required for GooglePlacesLeadDiscovery");
    }
    this.apiKey = key;
  }

  async discover(query: LeadDiscoveryQuery): Promise<DiscoveredLead[]> {
    if (!("lat" in query.location)) {
      // Nearby Search needs a coordinate center; free-text locations are
      // handled by the primary OSM+Nominatim source before this ever runs.
      return [];
    }
    const params = new URLSearchParams({
      location: `${query.location.lat},${query.location.lon}`,
      radius: String(query.location.radiusMeters),
      keyword: query.category,
      key: this.apiKey,
    });
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`${NEARBY_SEARCH_ENDPOINT}?${params.toString()}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        logger.warn({ status: res.status }, "google_places_discover_non_ok");
        return [];
      }
      const data = (await res.json()) as { status: string; results?: GooglePlaceResult[] };
      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        logger.warn({ status: data.status }, "google_places_discover_error_status");
        return [];
      }
      return (data.results ?? []).slice(0, query.limit).map(resultToLead);
    } catch (err) {
      logger.warn({ err }, "google_places_discover_failed");
      return [];
    }
  }
}
