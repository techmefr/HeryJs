/**
 * Every installed engine binds its driver under its own token instead of one
 * shared `SEARCH_DRIVER` symbol -- a single shared token is exactly what let
 * two external engines (Elasticsearch, Meilisearch) silently collide when
 * both were declared in hery.config.ts: whichever module's global provider
 * registered last simply overwrote the other's, with no error anywhere,
 * and every non-Prisma keyword ended up resolving to the same driver.
 * `Symbol.for` (the global symbol registry) guarantees the token a driver
 * module provides under a name and the token `SearchEngineRegistry` looks
 * up under the same name are reference-equal, even though the two never
 * import from each other.
 */
export function searchDriverToken(driverName: string): symbol {
  return Symbol.for(`heryjs:search-driver:${driverName}`);
}

/**
 * `tenantId` is mandatory on `index`/`search`, not optional metadata: an
 * external engine (Elasticsearch, Meilisearch) holds every tenant's documents
 * in the same collection, so the tenant boundary has to be enforced by the
 * driver's own query, not bolted on afterwards. Filtering the driver's
 * results in the caller (e.g. wrapping them in a Prisma `id: { in: [...] }`
 * and re-scoping there) still leaks: a top-N search that never knew about
 * tenants can fill its whole page with another tenant's matches, silently
 * starving or zeroing out the caller's own results with no error anywhere.
 * `remove` takes it too, for the same reason `index` and `search` do: a
 * driver should never need to trust an id alone to be safe to act on.
 */
export interface SearchDriver {
  index(
    collection: string,
    id: string,
    document: Record<string, unknown>,
    tenantId: string,
  ): Promise<void>;
  remove(collection: string, id: string, tenantId: string): Promise<void>;
  search(
    collection: string,
    term: string,
    fields: readonly string[],
    tenantId: string,
  ): Promise<string[]>;
}
