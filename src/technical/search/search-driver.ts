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
/**
 * A search never returns a bare list of ids, because a bare list cannot say
 * whether it is the whole answer. Every engine caps its own results by default
 * -- Elasticsearch at 10 hits, Meilisearch at 20, the Prisma driver at nothing
 * at all -- so a caller intersecting those ids with its own query would report
 * a total of 10 for a term matching thousands, with no error and no clue.
 *
 * `limit` is therefore an argument, not an engine default, and `truncated`
 * says whether it was reached. The route that asked turns that into a message
 * the caller can read: refine the term, there is more behind this page.
 */
export interface SearchMatches {
  ids: string[];
  truncated: boolean;
  limit: number;
}

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
    limit: number,
  ): Promise<SearchMatches>;
}

/**
 * One extra row is asked for so "as many as the limit allows" and "more than
 * the limit exists" stop looking identical, then dropped from the answer.
 */
export function matchesFrom(ids: string[], limit: number): SearchMatches {
  return { ids: ids.slice(0, limit), truncated: ids.length > limit, limit };
}
