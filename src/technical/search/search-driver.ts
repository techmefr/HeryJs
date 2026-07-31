export const SEARCH_DRIVER = Symbol('SEARCH_DRIVER');

/**
 * `tenantId` is mandatory on `index`/`search`, not optional metadata: an
 * external engine (Elasticsearch, Meilisearch) holds every tenant's documents
 * in the same collection, so the tenant boundary has to be enforced by the
 * driver's own query, not bolted on afterwards. Filtering the driver's
 * results in the caller (e.g. wrapping them in a Prisma `id: { in: [...] }`
 * and re-scoping there) still leaks: a top-N search that never knew about
 * tenants can fill its whole page with another tenant's matches, silently
 * starving or zeroing out the caller's own results with no error anywhere.
 */
export interface SearchDriver {
  index(
    collection: string,
    id: string,
    document: Record<string, unknown>,
    tenantId: string,
  ): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
  search(
    collection: string,
    term: string,
    fields: readonly string[],
    tenantId: string,
  ): Promise<string[]>;
}
