import { logger } from "@/server/observability/logger";

/**
 * Shared free-text → lat/lon geocoding via Nominatim (free, no key), used by
 * every lead-discovery adapter that accepts a free-text location (Overpass,
 * Geoapify). Extracted once a second adapter genuinely needed it — same
 * discipline as automated-mail-credentials.ts in this codebase.
 */
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
/** OSM's usage policy wants an HONEST, identifying user-agent — enforced by
 *  at least one Overpass mirror (masquerading UAs get 403). Never make this
 *  look like a browser. */
export const GEOCODE_USER_AGENT = "TalScout/1.0 (automated-outreach; contact: rishavkamboj50@gmail.com)";

export async function resolveCenterViaNominatim(
  text: string,
): Promise<{ lat: number; lon: number } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    // limit=5 (not 1): Nominatim's top hit for a bare place name is often
    // the administrative-boundary RELATION, whose centroid can land far from
    // the actual settlement (confirmed by direct testing — a major city's
    // boundary centroid landed in a sparse area with zero nearby POIs of any
    // kind, while its `place`/city node, ~15km away, sat right in the dense
    // urban core). Fetching a few candidates lets us prefer the actual place
    // point over the boundary shape.
    const url = `${NOMINATIM_ENDPOINT}?format=json&limit=5&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": GEOCODE_USER_AGENT },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const rows = (await res.json()) as { lat: string; lon: string; class?: string }[];
    if (rows.length === 0) return null;
    // A `place` result (city/town/village point) represents the named
    // settlement itself — the right anchor for "find businesses near here."
    // `boundary`/administrative results represent the governed area's
    // shape, which for a large or irregular region can center nowhere near
    // where people or businesses actually are.
    const best = rows.find((r) => r.class === "place") ?? rows[0];
    return { lat: parseFloat(best.lat), lon: parseFloat(best.lon) };
  } catch (err) {
    logger.warn({ err }, "nominatim_geocode_failed");
    return null;
  }
}
