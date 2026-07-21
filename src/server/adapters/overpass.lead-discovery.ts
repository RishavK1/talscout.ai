import { logger } from "@/server/observability/logger";
import { resolveCenterViaNominatim, GEOCODE_USER_AGENT } from "@/server/lib/geocode";
import type { LeadDiscovery, LeadDiscoveryQuery, DiscoveredLead } from "@/server/ports";

/**
 * Free, no-key business lead discovery via OpenStreetMap's Overpass API
 * (fixed hardcoded endpoint — no user-controlled URL, so no SSRF surface).
 * Free-text locations are geocoded to a lat/lon center first via Nominatim
 * (also free, no key). This is the PRIMARY, always-available discovery
 * source — see fallback.lead-discovery.ts for how an optional paid Google
 * Places fallback tops this up.
 */

/** Verified working (manually tested with real queries, not just reachable)
 *  — overpass-api.de is the primary; overpass.openstreetmap.fr is a genuine
 *  fallback for the primary's real (if infrequent) outages. Two mirrors
 *  tried during hardening — overpass.osm.ch and overpass.kumi.systems —
 *  were dropped: the former returns HTTP 200 with a silently EMPTY dataset
 *  even for a dense reference area (central Paris restaurants), which is
 *  worse than an error since it would be trusted as "genuinely zero
 *  results"; the latter never completed a request at all. Free, no key,
 *  same API. */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];
/** Apache's content negotiation on the Overpass hosts above 406s a request
 *  that's missing these — confirmed by direct testing: identical requests
 *  succeed with both headers present and fail without them. Not optional. */
const OVERPASS_HEADERS = {
  "content-type": "text/plain",
  accept: "application/json",
  "accept-encoding": "identity",
};
/** OSM's usage policy wants an HONEST, identifying user-agent — and it's
 *  enforced: overpass.openstreetmap.fr 403s masquerading strings (verified
 *  directly: "Mozilla/5.0 (compatible; ...Bot...)" → 403, this plain app
 *  identifier → 200, same request otherwise). Never make this look like a
 *  browser. */
const USER_AGENT = GEOCODE_USER_AGENT;
/** Radius used for free-text locations (a city name). 10km covers a metro's
 *  commercial spread without flooding results; explicit lat/lon queries carry
 *  their own radius. */
const DEFAULT_RADIUS_METERS = 10_000;

/** category → OSM tag(s). Best-effort map; unknown categories fall back to
 *  trying shop=<category> and amenity=<category> literally, since many OSM
 *  tag values already match common English category words. */
const CATEGORY_TAGS: Record<string, { key: string; value: string }[]> = {
  restaurant: [{ key: "amenity", value: "restaurant" }],
  cafe: [{ key: "amenity", value: "cafe" }],
  dentist: [{ key: "amenity", value: "dentist" }],
  doctor: [{ key: "amenity", value: "doctors" }],
  clinic: [{ key: "amenity", value: "clinic" }],
  gym: [{ key: "leisure", value: "fitness_centre" }],
  salon: [{ key: "shop", value: "hairdresser" }],
  lawyer: [{ key: "office", value: "lawyer" }],
  real_estate: [{ key: "office", value: "estate_agent" }],
  accountant: [{ key: "office", value: "accountant" }],
  plumber: [{ key: "craft", value: "plumber" }],
  electrician: [{ key: "craft", value: "electrician" }],
  hotel: [{ key: "tourism", value: "hotel" }],
  bar: [{ key: "amenity", value: "bar" }],
  bakery: [{ key: "shop", value: "bakery" }],
  pharmacy: [{ key: "amenity", value: "pharmacy" }],
  auto_repair: [{ key: "shop", value: "car_repair" }],
  veterinary: [{ key: "amenity", value: "veterinary" }],
  spa: [{ key: "leisure", value: "spa" }],
};

function tagsForCategory(category: string): { key: string; value: string }[] {
  const key = category.trim().toLowerCase().replace(/\s+/g, "_");
  if (CATEGORY_TAGS[key]) return CATEGORY_TAGS[key];
  return [
    { key: "shop", value: key },
    { key: "amenity", value: key },
  ];
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function elementToLead(el: OverpassElement): DiscoveredLead | null {
  const name = el.tags?.name;
  if (!name) return null; // unnamed POIs aren't usable leads
  const addressParts = [
    el.tags?.["addr:housenumber"],
    el.tags?.["addr:street"],
    el.tags?.["addr:city"],
    el.tags?.["addr:state"],
    el.tags?.["addr:postcode"],
  ].filter((p): p is string => Boolean(p));
  return {
    sourcePlaceId: `osm:${el.type}/${el.id}`,
    name,
    category:
      el.tags?.shop ?? el.tags?.amenity ?? el.tags?.office ?? el.tags?.craft ?? el.tags?.leisure ?? el.tags?.tourism,
    address: addressParts.length ? addressParts.join(", ") : undefined,
    phone: el.tags?.phone ?? el.tags?.["contact:phone"],
    website: el.tags?.website ?? el.tags?.["contact:website"],
    // Many listings publish their contact email directly on the map entry —
    // a free, already-public email that saves the whole finder waterfall.
    email: el.tags?.email ?? el.tags?.["contact:email"],
    lat: el.lat ?? el.center?.lat,
    lon: el.lon ?? el.center?.lon,
  };
}

export class OverpassLeadDiscovery implements LeadDiscovery {
  async discover(query: LeadDiscoveryQuery): Promise<DiscoveredLead[]> {
    const center = await this.resolveCenter(query.location);
    if (!center) return [];

    // Free-text locations escalate the search radius when the area comes up
    // short: many campaigns die at 10km simply because the city's POIs (or
    // the ones with usable contact data) sit outside a tight circle. An
    // explicit lat/lon+radius is the caller's own choice and is respected
    // as-is.
    const radii =
      "radiusMeters" in query.location
        ? [query.location.radiusMeters]
        : [DEFAULT_RADIUS_METERS, 25_000, 50_000];

    const byId = new Map<string, DiscoveredLead>();
    for (const radius of radii) {
      if (byId.size >= query.limit) break;
      const elements = await this.fetchAtRadius(query.category, center, radius, query.limit);
      for (const el of elements) {
        const lead = elementToLead(el);
        if (lead && !byId.has(lead.sourcePlaceId)) byId.set(lead.sourcePlaceId, lead);
        if (byId.size >= query.limit) break;
      }
    }
    return [...byId.values()];
  }

  private async fetchAtRadius(
    category: string,
    center: { lat: number; lon: number },
    radius: number,
    limit: number,
  ): Promise<OverpassElement[]> {
    const tags = tagsForCategory(category);
    const filters = tags
      .map(
        (t) =>
          `node["${t.key}"="${t.value}"](around:${radius},${center.lat},${center.lon});\n` +
          `way["${t.key}"="${t.value}"](around:${radius},${center.lat},${center.lon});`,
      )
      .join("\n");
    const ql = `[out:json][timeout:25];\n(\n${filters}\n);\nout center tags ${limit};`;

    for (const endpoint of OVERPASS_ENDPOINTS) {
      const elements = await this.fetchWithRetry(endpoint, ql);
      if (elements) return elements;
    }
    // Every mirror failed — fail soft, same as any other discovery miss.
    return [];
  }

  /** Free shared infrastructure occasionally 403/406/429s a request that
   *  would succeed a moment later (observed directly: an identical request
   *  to the same endpoint failed, then succeeded seconds later with nothing
   *  else changed) — one short retry per endpoint before moving on absorbs
   *  that without materially slowing a cron-scheduled background job. */
  private async fetchWithRetry(
    endpoint: string,
    ql: string,
  ): Promise<OverpassElement[] | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1_500));
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25_000);
        const res = await fetch(endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: { ...OVERPASS_HEADERS, "user-agent": USER_AGENT },
          body: ql,
        });
        clearTimeout(timer);
        if (!res.ok) {
          logger.warn({ status: res.status, endpoint, attempt }, "overpass_discover_non_ok");
          continue;
        }
        const data = (await res.json()) as { elements?: OverpassElement[] };
        return data.elements ?? [];
      } catch (err) {
        logger.warn({ err, endpoint, attempt }, "overpass_discover_failed");
      }
    }
    return null;
  }

  private async resolveCenter(
    location: LeadDiscoveryQuery["location"],
  ): Promise<{ lat: number; lon: number } | null> {
    if ("lat" in location) return { lat: location.lat, lon: location.lon };
    return resolveCenterViaNominatim(location.text);
  }
}
