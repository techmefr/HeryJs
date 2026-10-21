---
title: OpenAPI and typed client
description: Generate an OpenAPI 3.1 document and a typed TypeScript client from your blueprints, and read the list of what neither can know.
---

Every routed resource publishes its contract at `GET /<resource>/describe`: fields, what is filterable, sortable, selectable, includable, whether it pages, its version. `hery openapi` and `hery openapi:client` turn that same contract, plus the request and response envelope the generated controller uses, into two artifacts. They read the blueprints, the way `hery generate` does, so neither needs a running app, a database or a session.

```bash
hery openapi --out openapi.json --title "My API" --api-version 2.0.0
hery openapi:client --out src/api-client.ts
```

Both accept `--blueprints <dir>` (default `blueprints`) and skip blueprints declared `routed: false`.

## The OpenAPI document

One document, OpenAPI 3.1, JSON Schema 2020-12 inside. For each resource:

- `POST /<resource>/search` (200), and `create`, `update`, `delete`, `restore` (201, as the controller answers), plus `GET /<resource>/describe`. `restore` exists only when the blueprint keeps soft deletes.
- `POST /<resource>/{id}/<relation>/search` for each include declared with `ownRoute: true`.
- Request schemas that only admit what the contract admits: filter fields, sorts as `{ field, direction }` entries, selects, one entry shape per include and per aggregate (`avg`, `sum`, `min`, `max` require a field the relation declares), the declared page sizes. A resource with no pagination or no bin rejects `page`, `limit`, `withTrashed` and `onlyTrashed`, and the schema says so instead of accepting a no-op.
- Batch outcomes as a union on `status`: an `ok` entry carries `data`, an `error` entry carries `{ status, key, message, details }`, and one failure does not fail the others.
- Bearer authentication, and the `{ error }` body of 400, 401 and 403.
- A second `version` of the same resource gets its own paths under `/v<n>/` and its own schema names (`WidgetV2`).

The record schema is what the generated view returns: `id`, `tenantId`, `ownerId`, `teamId` when a permission is scoped to a team, the non-hidden fields, the timestamps, and `deletedAt` with soft deletes. A hidden field is accepted on create and update and is never returned.

## The typed client

`hery openapi:client` writes one self-contained file. You give it a transport, it gives you the contract:

```ts
const api = createHeryClient(<T>(method, path, body) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((response) => response.json() as Promise<T>),
);

const found = await api.blogPosts.search({
  filters: [{ field: 'title', operator: 'like', value: 'draft' }],
  sorts: [{ field: 'createdAt', direction: 'desc' }],
  selects: [{ field: 'title' }],
  limit: 20,
});
found.data[0]?.title;
```

`filters`, `sorts`, `selects`, `includes` and `aggregates` are checked against the blueprint, `limit` is the union of the declared page sizes, `selects` narrows the returned record to the keys you asked for, and `meta` is the paged shape or the unpaged one depending on the resource. Drop a field from the blueprint, regenerate, and every call still naming it stops compiling.

## What neither can know

A client generator believes what it is told, so these are stated as absent rather than guessed. They are not in `/describe`, and the generated file and the document's `info.description` both repeat the list.

- **The resolved-capability block.** `capabilities` on a record, and on `meta`, appear when the request names `capabilities`. `/describe` publishes neither the keys nor the values. Typed as an open object.
- **Capability-dependent shapes.** Nothing in `/describe` says a field or a route varies with who calls. A route the caller lacks the capability for answers 403; the spec does not model who gets it.
- **Morph targets.** `/describe` names a `morphMany` relation, its discriminator and its discriminator value. It does not say which resource the rows belong to or how their fields are typed.
- **Types inside included rows, and aggregate values under an alias.** `/describe` lists a relation's selectable names, not their types. Rows are typed by key only, with `unknown` values, and an alias is a free key on the record.
- **Opaque payloads.** The text of `messages`, `meta.channels`, error `details`, and the JSON Schema under `rules` beyond being an object.

Two things are mirrored from the generator rather than read off `/describe`, and a spec keeps them honest: the record's `tenantId`, `ownerId` and `teamId` (the view returns them, `selects` lists only some), and the request limits the server enforces. `cli/lib/openapi-parity.spec.ts` compares them to the generated controller, view and DTO, so a template change that moves one fails there instead of drifting silently.
