const cache: Record<string, string[]> = {};

export function getRecentSearches(tenantId: string): string[] {
  if (!tenantId) return [];
  return cache[tenantId] || [];
}

export function addRecentSearch(tenantId: string, q: string): void {
  if (!tenantId || !q.trim()) return;
  let list = cache[tenantId] || [];
  list = list.filter((item) => item.toLowerCase() !== q.trim().toLowerCase());
  list.unshift(q.trim());
  cache[tenantId] = list.slice(0, 5);
}
