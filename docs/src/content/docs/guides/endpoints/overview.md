---
title: Overview
description: What every generated endpoint shares — the six routes, the envelope, and where to authenticate — before the per-endpoint pages get specific.
---

Every resource `hery generate` produces exposes the same six routes, shaped by the same envelope. Once you have read one resource's endpoints, you have effectively read all of them — the only things that change from one resource to the next are the URL segment and the fields inside `data`.

The pages in this section walk through a real one, `BlogPost`, end to end. Each page covers one endpoint: what to send, and exactly what comes back.

## The six routes

| Method | Path                  | What it does                                                          | Documented in                          |
| ------ | --------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| `POST` | `/blog-posts/search`    | List, with search, sort, filter, pagination — also how one record is read, filtered to its id | [Search](/guides/endpoints/search/), [Details](/guides/endpoints/details/) |
| `GET`  | `/blog-posts/describe`  | The resource's contract — fields, sorts, filters, selects, includes, aggregates, limits, validation rules | [Details](/guides/endpoints/details/)  |
| `POST` | `/blog-posts/create`    | Create one or many records in one call                                | [Create](/guides/endpoints/create/)    |
| `POST` | `/blog-posts/update`    | Update one or many records in one call, including relations           | [Update](/guides/endpoints/update/)    |
| `POST` | `/blog-posts/delete`    | Soft-delete (or hard-delete with `mode: "hard"`) one or many records  | [Delete](/guides/endpoints/delete/)    |
| `POST` | `/blog-posts/restore`   | Undo a soft-delete for one or many records                            | [Restore](/guides/endpoints/restore/)  |

Every mutating route takes an array — `data` for create/update, `ids` for delete/restore — even for a single record, and answers with one result per entry, each carrying its own `status`. One entry failing never blocks the others in the same request.

Every one of them requires a session — send the bearer token you got from `/auth/login` or `/auth/register` in an `Authorization: Bearer <token>` header. See [Authentication](/guides/authentication/) for how to get one.

## The envelope

Three keys, always: `data`, `meta` (only when there is something to say about the response — search results carry realtime channel names, for instance), `messages` (a list of strings for a human — often empty, always present, safe to render unconditionally). This is the whole envelope; there is no fourth shape hiding somewhere else.

```json
{
  "data": { "id": "cly8x7g9k0000abc123def456", "title": "Hello world" },
  "messages": []
}
```

## The headers on every response

Set by a middleware the application registers itself, ahead of everything else, so they are there even when a request fails before reaching a handler: `nosniff`, no framing, no referrer, no `X-Powered-By`, and a content security policy that permits inline styles and **no script at all** — the only HTML served here is the error page, and it needs nothing more. The one exception is `/jobs`, the queue dashboard, which is a third-party UI with its own scripts and is mounted in development only.

## What a single request may ask for

A page size is a product decision, so a blueprint declares it. The size of the request itself is not, and every one of these is refused with `query.invalid` rather than planned by the database:

| In a request                                            | At most  |
| ------------------------------------------------------- | -------- |
| `filters` (per level, three levels deep at most)         | 50       |
| values in one `in` / `not in`                            | 500      |
| `sorts`                                                  | 10       |
| `selects`                                                | 100      |
| `includes`, `aggregates`                                 | 20 each  |
| `limit` on an include                                    | 1000     |
| `page`                                                   | 100 000  |
| `capabilities`                                           | 50       |
| records in one `create`/`update`/`delete`/`restore` call  | 100      |

The batch cap is `MAX_BATCH_ENTRIES` in `technical/http/batch.ts`, and the generated DTO is your file — a resource that genuinely needs larger batches raises it there, on that resource, deliberately.

## The framework's own routes

Beside your resources, the kernel and the modules ship routes of their own — `/audit-logs`, `/teams`, `/notifications`, `/api-keys`, `/feature-flags`, `/mail` once the module is installed. That is our code, not generated code, so it does not ask you to decide anything before it is usable: **every one of those collections pages**, with the same `page`/`limit`/`total`/`last_page` meta a generated resource reports.

They are `GET` routes, so the window goes in the query string: `GET /audit-logs?page=2&limit=50`. The accepted page sizes are `10`, `25`, `50`, `100`, and the default is `25` — anything else is refused with the same `query.invalid` key as any other rejected parameter. `lint:pagination` fails the build on a framework collection route that does not page, unless it declares `@UnpaginatedRoute('<why>')` — which is how the route table, the scheduled tasks, the exposed actions and the capped devtools buffers say out loud that they return everything they have, and why that is bounded.

## When something goes wrong

Every error, from every route, comes back the same way — see [Errors and responses](/guides/errors-and-responses/) for the full table of status/key pairs. The one rule worth keeping in mind while building a UI: **the `key` is what you branch on in code, the `message` is what you show a human, and neither ever changes shape** between resources or between routes.

If a response looks wrong and you can't tell why — a 403 you didn't expect, a filter that silently returns nothing — see [Debugging with the pipeline trace](/guides/debugging/), which is aimed at whoever owns the backend for exactly this conversation.
