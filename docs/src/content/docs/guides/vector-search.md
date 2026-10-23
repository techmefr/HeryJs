---
title: Vector search
description: Rank a resource by meaning with a vector blueprint field, an embeddings driver and search mode similar, under the same tenant and capability rules as every other read.
---

A query for "cheap flights" never finds a post titled "budget airfares" through [full-text search](../guides/search/). A vector field fixes that: the resource stores an embedding of one of its text fields, and the search route can rank by how close another text is to it.

```bash
pnpm hery install embeddings
```

:::caution[Upgrading an existing project]
Switch your Postgres image to `pgvector/pgvector:pg17` (in `docker-compose.yml` and in CI) **before** running `pnpm hery migrate`. The new kernel migration runs `CREATE EXTENSION vector`, which fails on a stock `postgres` image. On managed Postgres, enable the `vector` extension from the provider's console first (Supabase, Neon, RDS and Cloud SQL all offer it).
:::

## Declaring it

```yaml
name: Note
fields:
  - name: title
    type: string
  - name: body
    type: string
    optional: true
  - name: embedding
    type: vector
    dimensions: 1536
    source: body
```

`dimensions` is the column width and has to match the model the active driver calls. `source` names a string field of the same resource. At most one vector field per resource, never optional or hidden by declaration (it is always nullable and never returned), never sortable or filterable. The generated model carries `embedding Unsupported("vector(1536)")?`, and the DTO, the view, the OpenAPI document and `/describe` do not mention it beyond `"similar": true`.

The extension itself is enabled once, by a kernel migration (`CREATE EXTENSION vector`). The compose file and CI use the `pgvector/pgvector` Postgres image for that reason: **an existing project has to switch its Postgres image** before it can migrate.

Then import `EmbeddingsModule` into `src/app.module.ts`. A resource with a vector field refuses to boot without it.

## Writing

The embedding rides on the [transactional outbox](../guides/outbox/). A write to a model annotated `/// @hery.tenantScoped` already stages a `model.created` or `model.updated` message in the transaction of the write itself, and the kernel's `vector-embedding` handler takes it from there: on a creation, or on an update whose `changedFields` contain the source field, it reads the source text **at delivery time**, embeds it and stores the vector. A burst of edits therefore converges on the last text, and a restore that patches the source re-embeds like any other update.

Because the message commits with the row, an embedding cannot be lost between the commit and the enqueue. A provider that is down never fails the write: the relay retries with backoff and dead-letters after its attempts (`OutboxService.deadLetters()` and `requeue()`). An emptied source clears the embedding, so a stale vector stops matching. Until the message is delivered the row has no embedding and similarity search skips it, which is up to the relay interval (`OUTBOX_RELAY_INTERVAL_MS`, 2 seconds by default).

## Searching

```
POST /notes/search
{ "search": { "q": "budget airfares", "mode": "similar", "metric": "cosine" } }
```

`metric` is `cosine` (the default) or `l2`. The query text is embedded by the same driver, and the nearest rows come back in similarity order. Pagination still applies, over the ranked window.

What is refused rather than ignored, each as a 400: `mode: similar` on a resource with no vector field, an empty `q`, a text `engine`, a `cursor`, `sorts`, and a `metric` on a text search.

`filters`, `withTrashed` and `onlyTrashed` apply as usual. The tenant, the view capability's scope and the trash state are in the ranking SQL itself, **not applied to a top-N afterwards**: a nearest-neighbour cut that never knew about tenants fills its window with rows the caller may not see. Your own `filters` are the exception, applied after the cut, so a very selective filter can return fewer rows than the window.

The ranking query runs in a transaction that sets `app.tenant_id`, so [row-level security](../guides/tenancy/) governs it like any other read.

## The cap

Nearest-neighbour search never runs out of matches, so it is capped by `VECTOR_SEARCH_LIMIT` (default 50, at most 1000). When the cap is the reason a page is short, `meta.search` says so (`truncated`, `matchLimit`) and a message tells the caller to narrow the query. `meta.search.mode` and `metric` name which ranking answered.

## Drivers

```ts
export interface EmbeddingDriver {
  readonly dimensions: number;
  embed(texts: readonly string[]): Promise<number[][]>;
}
```

The contract and `embeddingDriverToken(name)` live in the kernel; the registry, the `EmbeddingsService` facade and the built-in drivers live in the module, as for [every module](../guides/modules-and-drivers/).

- `fake` is the zero-config default. It hashes words into a unit vector, so the same text always gives the same vector and texts sharing words land close. No network, which is what tests want.
- `openai-compatible` posts to `{EMBEDDINGS_OPENAI_BASE_URL}/embeddings` with the built-in `fetch`: OpenAI, Ollama, vLLM, LiteLLM. Set `EMBEDDINGS_OPENAI_API_KEY` when the endpoint wants one, `EMBEDDINGS_OPENAI_MODEL`, and `EMBEDDINGS_OPENAI_SEND_DIMENSIONS=true` to pass `dimensions` to models that can shorten their output.

```ts
embeddings: {
  default: process.env.EMBEDDINGS_DRIVER ?? 'fake',
  drivers: {
    fake: { driver: 'fake' },
    openai: { driver: 'openai-compatible' },
  },
},
```

`EMBEDDINGS_DIMENSIONS` (default 1536) is the width both built-in drivers declare. A vector whose length differs from the column fails the job, or the search, with `embeddings.dimension-mismatch` before reaching the database.

## What it does not do

No index is created. Without one every similarity query scans the tenant's embedded rows, which is exact and fine into the tens of thousands. Past that, add an HNSW index in a hand-written migration (`CREATE INDEX ... USING hnsw ("embedding" vector_cosine_ops)`); Prisma does not model it. Be aware that an approximate index combined with the tenant filter can return fewer rows than asked, which pgvector 0.8's iterative scans address.

## Backfilling existing rows

Rows written before the field existed have no vector, and similarity search skips them. Embed them with:

```bash
pnpm hery embeddings:backfill note --dry-run
pnpm hery embeddings:backfill note
```

It reads the blueprint, walks every tenant (or one, with `--tenant <id>`) in id order, `--batch` rows per query (default 100), and embeds the live rows that have source text and no vector. It is idempotent: a rerun only touches rows still missing one, so an interrupted run resumes by running it again. `--dry-run` counts and changes nothing. A row that fails is reported and skipped, and the command exits non-zero.
