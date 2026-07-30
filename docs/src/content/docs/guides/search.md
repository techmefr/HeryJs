---
title: Full-text search
description: Prisma by default, Elasticsearch or Meilisearch as modules, behind one three-method contract — and what changes when you swap.
---

Every generated resource accepts a free-text query on its collection route:

```
GET /workouts?q=squat
```

No configuration, no module, no engine. The default implementation is a `LIKE` against the resource's string columns, which is the right answer for most projects for a long time. When it stops being the right answer, an engine drops in behind the same contract.

## The contract

Three methods, in `technical/search/search-driver.ts`:

```ts
export const SEARCH_DRIVER = Symbol('SEARCH_DRIVER');

export interface SearchDriver {
  index(collection: string, id: string, document: Record<string, unknown>): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
  search(collection: string, term: string, fields: readonly string[]): Promise<string[]>;
}
```

`search()` returns **ids only** — no scores, no highlights, no totals. That is what lets the engine's answer be folded into a Prisma query as one clause among several, instead of becoming the source of the response. The engine proposes candidates; the database still decides what the caller may see.

## Selecting a driver

There is no environment variable for this. The generated service injects the driver **optionally**:

```ts
@Optional()
@Inject(SEARCH_DRIVER)
private readonly searchDriver?: SearchDriver,
```

So the default is literally *no provider bound*, and the fallback path runs. Installing `search-elasticsearch` or `search-meilisearch` writes a driver plus a global module that binds `SEARCH_DRIVER`; importing that module into `src/app.module.ts` is what switches every resource over at once.

```bash
pnpm hery install search-meilisearch
pnpm hery up --start          # boots the service, resolves MEILISEARCH_URL into .env
```

## The default: Prisma `contains`

```ts
return {
  OR: fields.map((field) => ({
    [field]: { contains: term, mode: 'insensitive' as const },
  })),
};
```

A case-insensitive substring match, OR-ed across the resource's searchable fields. Honest about what it is: no tokenising, no stemming, no fuzziness, no relevance ranking. `q=squat press` matches only that literal contiguous string inside a single field, and a leading-wildcard `LIKE` cannot use a normal index, so it is a sequential scan.

What it does have, and what an engine gives up, is that the text predicate and the security predicates are evaluated in the *same SQL statement*. That turns out to matter — see below.

## Which fields are searchable

Every field the blueprint declares as `type: string`. There is no blueprint key for this and no opt-out: the generator collects the string fields at generation time and emits them as a constant in the service.

```ts
const SEARCHABLE_FIELDS = ['title', 'notes'] as const;
```

Because it is a plain constant in a file you own, narrowing it is an edit, not a configuration change. Two things worth knowing before you rely on the default:

- A field marked `hidden: true` in the blueprint is still searchable. It is stripped from responses by the view, so its *contents* never reach the client — but a caller can still discover that some record matches a guessed value, and with an engine installed the field is shipped into the external index.
- A resource with no string fields gets an empty list, and `?q=` silently matches nothing rather than erroring.

## Search cannot widen what you may see

This is the part that has to be right. The generated `search()` composes three independent clauses:

```ts
return this.prisma.workout.findMany({
  where: {
    AND: [
      scopeWhereFor('own', subject),
      trashedWhere,
      { ...options.filters, ...searchWhere },
    ],
  },
  take: options.limit,
});
```

The capability scope sits in its own `AND` branch; the search clause sits in another. Because they are separate elements of an `AND`, search can only ever *intersect* — it is arithmetically incapable of re-admitting a row the scope excluded. That holds for the engine path too, where `searchWhere` is an `id: { in: [...] }` list handed back by a system that knows nothing about permissions.

Tenancy is enforced a layer lower still, by the tenant-scoping Prisma extension, which adds its own `tenantId` filter to the same query. Neither clause can be reached from the query string.

## What changes when you install an engine

Two behaviour changes, neither of which is a leak, both of which you should know about before flipping the switch.

**Recall becomes approximate in a multi-tenant deployment.** The index name is the resource name, shared by every tenant, and the indexed document carries only the searchable fields — no `tenantId`, no `ownerId`, no `teamId`. `SearchDriver.search()` takes no filter argument. So the engine returns its default top-N hits computed across *all* tenants and owners, and Prisma then discards the ones the caller may not see. Nothing leaks, but a tenant with genuinely matching records can receive fewer results than exist — or none — because the global result window was consumed by other tenants' documents. On the default Prisma path this cannot happen.

**Soft-deleted records leave the index.** `softDelete` removes the document and `restore` re-adds it, so `?q=…&onlyTrashed=true` returns nothing while a driver is active, where the default path would return the matches.

## Index maintenance is synchronous and unguarded

The generated service syncs the index inside the same request as the write, after the database has committed:

```ts
private async syncSearchIndex(record: Workout) {
  if (!this.searchDriver) {
    return;
  }
  if (record.deletedAt) {
    await this.searchDriver.remove(SEARCH_COLLECTION, record.id);
    return;
  }
  const document = Object.fromEntries(
    SEARCHABLE_FIELDS.map((field) => [field, record[field]]),
  );
  await this.searchDriver.index(SEARCH_COLLECTION, record.id, document);
}
```

Called from `create`, `update`, `softDelete` and `restore`. The `await` is not wrapped in a `try`, which has a consequence worth stating plainly: **if the engine is unreachable, the write still commits and the request still fails.** The caller sees a 5xx for an operation that succeeded, and the index falls behind.

There is also no reindex or backfill command. Installing a search module on an existing dataset leaves the index empty — only records written afterwards are indexed. Both of these are real gaps rather than design decisions, and both are worth a small piece of owned code before an engine goes anywhere near production: wrap `syncSearchIndex` in your own error handling, and write the backfill loop once.

## The services

Both modules ship a compose file with the container port unpublished, so Docker assigns a host port and `hery up --start` writes the resolved URL into `.env`.

| | Elasticsearch | Meilisearch |
|---|---|---|
| Module | `search-elasticsearch` | `search-meilisearch` |
| Query | `multi_match` across the fields | `attributesToSearchOn` |
| Default window | 10 hits | 20 hits |
| URL variable | `ELASTICSEARCH_URL` | `MEILISEARCH_URL` |
| Also | — | `MEILISEARCH_API_KEY` |

Neither driver creates an explicit mapping or index settings — indices are created implicitly on first write with the engine's dynamic defaults, and field restriction happens per query rather than in a stored configuration.

Note that neither driver passes a result-size parameter, so the engine's default window above is the effective ceiling on candidates *before* the security clauses narrow them. Raising it is an edit in the driver file, which you own.
