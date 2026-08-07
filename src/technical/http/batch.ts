/**
 * How many records one call to a generated create/update/delete/restore route
 * may carry. Every mutating verb takes an array so a single record and a batch
 * answer the same shape, and nothing bounded that array: one request could ask
 * for a hundred thousand writes, each with its own audit entry and its own
 * advisory lock on the tenant's audit chain.
 *
 * Unlike a page size, this is not a product decision the blueprint declares --
 * it protects the server, so the framework picks it. The generated DTO is the
 * developer's own file, so a resource that genuinely needs larger batches raises
 * it there, deliberately, on the resource it applies to.
 */
export const MAX_BATCH_ENTRIES = 100;
