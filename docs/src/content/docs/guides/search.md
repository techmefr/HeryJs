---
title: Full-text search
description: A closed list of named engines declared in hery.config.ts, Prisma as the built-in default, Elasticsearch or Meilisearch as installable drivers behind the same tenant-safe contract.
---

Every generated resource accepts a free-text query in its search route's body:

```
POST /blog-posts/search
{ "search": { "q": "squat" } }
```

With no config and no module installed, that runs against Prisma — a case-insensitive substring match, the right answer for most projects for a long time. When it stops being the right answer, an engine drops in behind the same contract, selected by name rather than by which module happens to be installed.

## `hery.config.ts` is the closed list of engines

A project-root config file, typed against `HeryConfig` via `satisfies` — an unknown key or a malformed engine fails at typecheck, not at boot:

```ts
// hery.config.ts
import type { HeryConfig } from './src/technical/config/hery-config.types';

export default {
  search: {
    default: 'prisma',
    engines: {
      prisma: { driver: 'prisma' },
    },
  },
} satisfies HeryConfig;
```

`search.engines` is a Scout-style keyword-to-driver map. Adding an entry after installing `search-elasticsearch`:

```ts
export default {
  search: {
    default: 'prisma',
    engines: {
      prisma: { driver: 'prisma' },
      elasticsearch: { driver: 'elasticsearch' },
    },
  },
} satisfies HeryConfig;
```

`SearchEngineRegistry` resolves every declared engine once, at boot. A `driver` this list names without a matching module installed to back it fails the app's own startup — not a silent fallback to Prisma, not a 500 on first search. Fix it the way any other misconfiguration gets fixed: install the module, or remove the entry.

Declaring more than one non-Prisma engine at once is supported — `elasticsearch` and `meilisearch` can both be present in `search.engines` in the same app, each resolving to its own driver instance, never to each other's.

## Selecting an engine per request

```
POST /blog-posts/search
{ "search": { "q": "squat", "engine": "elasticsearch" } }
```

`search.engine` picks the keyword from `hery.config.ts`'s closed list, alongside `filters` in the same JSON body. Omit it and the request falls back to `search.default`. Ask for a keyword the config never declared and the answer is a plain `InvalidQueryException` — a 400, the same family as an unknown sort or filter field, never a silent fallback and never a 5xx.

Prisma is one entry in that list like any other, not a special case: `PrismaSearchDriver` implements the exact same `SearchDriver` interface Elasticsearch and Meilisearch do.

## The contract

Three methods, in `technical/search/search-driver.ts`:

```ts
export function searchDriverToken(driverName: string): symbol {
  return Symbol.for(`heryjs:search-driver:${driverName}`);
}

export interface SearchDriver {
  index(collection: string, id: string, document: Record<string, unknown>, tenantId: string): Promise<void>;
  remove(collection: string, id: string, tenantId: string): Promise<void>;
  search(collection: string, term: string, fields: readonly string[], tenantId: string): Promise<string[]>;
}
```

Each driver module provides under its own token — `searchDriverToken('elasticsearch')`, `searchDriverToken('meilisearch')` — rather than one token every driver module binds to. Two engines installed side by side each keep their own provider; nothing has to alias, and nothing silently overwrites the other.

`tenantId` is part of the `remove()` signature for consistency with `index()`/`search()`, even though neither shipped driver needs it: a Prisma cuid is already globally unique, so there is no ambiguity a tenant filter would resolve on delete.

`search()` returns **ids only** — no scores, no highlights, no totals. That is what lets the engine's answer be folded into a Prisma query as one clause among several, instead of becoming the source of the response. The engine proposes candidates; the database still decides what the caller may see.

`tenantId` is mandatory on `index()` and `search()`, not optional metadata. An external engine holds every tenant's documents in one collection, so the tenant boundary has to be enforced inside the driver's own query — `bool.filter` on Elasticsearch, `filter` plus `updateFilterableAttributes` on Meilisearch — not bolted on by filtering the driver's results afterwards. A top-N search that never knew about tenants can fill its whole page with another tenant's matches, silently starving or zeroing out the caller's own results with no error anywhere. `PrismaSearchDriver` gets this for free: it reads through the same tenant-scoped Prisma client every other query already goes through, so it simply ignores the parameter.

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
- A resource with no string fields gets an empty list, and `search.q` silently matches nothing rather than erroring.

## Search cannot widen what you may see

This is the part that has to be right. The generated `search()` composes three independent clauses:

```ts
return this.prisma.blog-post.findMany({
  where: {
    AND: [
      scopeWhereFor(BLOG_POST_PRESETS.view, subject),
      trashedWhere,
      { ...options.filters, ...searchWhere },
    ],
  },
  take: options.limit,
});
```

The capability scope sits in its own `AND` branch; the search clause sits in another. Because they are separate elements of an `AND`, search can only ever *intersect* — it is arithmetically incapable of re-admitting a row the scope excluded. That holds for the engine path too, where `searchWhere` is an `id: { in: [...] }` list handed back by a system that, for an external engine, already filtered by tenant on its own side before returning anything.

Tenancy is enforced a layer lower still, by the tenant-scoping Prisma extension, which adds its own `tenantId` filter to the same query. Neither clause can be reached from the query string.

## What still changes when you install an engine

**Soft-deleted records leave the index.** `softDelete` removes the document and `restore` re-adds it, so `{ "search": { "q": "…" }, "onlyTrashed": true }` returns nothing while a non-Prisma driver is active, where the default path would return the matches.

**Recall is capped by one declared limit, and the response says when the cap was reached.** The three drivers used to inherit three different ceilings — Elasticsearch answers with 10 hits by default, Meilisearch with 20, the Prisma driver with every matching row — and none of them told the caller. A term matching 40 000 records came back with a `total` of 10, indistinguishable from a term that genuinely matched 10.

`SEARCH_MATCH_LIMIT` (default `1000`) is now passed to whichever driver runs, each asks its engine for one row past it, and the search response reports what happened:

```json
"meta": {
  "total": 1000,
  "search": { "matchLimit": 1000, "truncated": true }
},
"messages": [
  "Only the first 1000 full-text matches were counted, and more exist. The totals below are a floor, not a count -- narrow the search term to see the rest."
]
```

`truncated: false` means `total` is a count. `truncated: true` means it is a floor — the security clauses then narrow those candidates further, so the page you get is a subset of a subset, and that is now something the caller can see rather than guess.

## Index maintenance is asynchronous by failure, not by design

The generated service syncs the index inside the same request as the write, after the database has committed, wrapped in its own `try`/`catch`:

```ts
private async syncSearchIndex(record: BlogPost) {
  for (const driver of this.searchEngines.externalDrivers) {
    try {
      if (record.deletedAt) {
        await driver.remove(SEARCH_COLLECTION, record.id, record.tenantId);
        continue;
      }
      const document = Object.fromEntries(
        SEARCHABLE_FIELDS.map((field) => [field, record[field]]),
      );
      await driver.index(SEARCH_COLLECTION, record.id, document, record.tenantId);
    } catch (error) {
      this.logger.warn(`search index out of sync for ${SEARCH_COLLECTION}:${record.id}: ${error.message}`);
    }
  }
}
```

Called from `create`, `update`, `softDelete` and `restore`. An unreachable engine logs and moves on for that engine only: the write still commits and the request still succeeds, at the cost of that engine's index falling behind until it is reachable again — one engine being down never stops the others from getting the update. `externalDrivers` is every distinct non-Prisma driver a project has installed, deduplicated by instance — `search[engine]` lets a later request read through any of them, so a write has to reach all of them, not just whichever was declared first. Prisma's own `index()`/`remove()` are no-ops, since Prisma is already the system of record and never needs a separate sync step.

## Backfilling an existing dataset

```bash
pnpm hery search:reindex BlogPost
```

Installing a search module on an existing dataset does not retroactively index anything written before it — only writes made afterwards go through `syncSearchIndex`. `search:reindex <model>` walks every row of that Prisma model, across every tenant, and calls `index()` or `remove()` on whatever driver is installed, deriving the searchable fields from the same rule the generator itself uses (every scalar `String` field, minus the reserved ones like `id`/`tenantId`/timestamps). It bypasses the tenant-scoped Prisma client entirely — the same way `prisma/seed.ts` does — because a backfill has no single request's tenant to scope by; it needs every tenant's rows in one pass.

## The services

Both modules ship a compose file with the container port unpublished, so Docker assigns a host port and `hery up --start` writes the resolved URL into `.env`.

| | Elasticsearch | Meilisearch |
|---|---|---|
| Module | `search-elasticsearch` | `search-meilisearch` |
| Query | `multi_match` across the fields | `attributesToSearchOn` |
| Default window | 10 hits | 20 hits |
| URL variable | `ELASTICSEARCH_URL` | `MEILISEARCH_URL` |
| Also | — | `MEILISEARCH_API_KEY` |

Neither driver creates an explicit mapping or index settings — indices are created implicitly on first write with the engine's dynamic defaults, and field restriction happens per query rather than in a stored configuration. Installing either prints a reminder to declare the engine in `hery.config.ts`; until it is declared, `search.engine` has no keyword to select it by.
