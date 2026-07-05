/**
 * Recent semantic searches, persisted per-tenant in localStorage so the
 * dashboard panel survives reloads (the old version was an in-memory cache
 * that reset on every refresh). SSR-safe: storage is only touched in the
 * browser; on the server these helpers are no-ops.
 */
const KEY_PREFIX = "talscout:recent-searches:";
const MAX_ITEMS = 5;

function storageKey(tenantId: string): string {
  return `${KEY_PREFIX}${tenantId}`;
}

export function getRecentSearches(tenantId: string): string[] {
  if (!tenantId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(tenantId: string, q: string): void {
  if (!tenantId || !q.trim() || typeof window === "undefined") return;
  const term = q.trim();
  const list = getRecentSearches(tenantId).filter(
    (item) => item.toLowerCase() !== term.toLowerCase(),
  );
  list.unshift(term);
  try {
    window.localStorage.setItem(
      storageKey(tenantId),
      JSON.stringify(list.slice(0, MAX_ITEMS)),
    );
  } catch {
    // storage full/blocked — recent searches are a nicety, never an error
  }
}
