---
title: Optimistic concurrency
description: A versioned resource refuses an update made against a copy of the record that someone else has since changed.
---

Two people open the same record, both edit it, both save. Without help the second save silently erases the first. Declare the resource as versioned and the update route refuses a write that was made against a stale copy.

```yaml
name: BlogPost
versioned: true
```

Off by default, so a resource that does not opt in keeps the schema it has today. `versioned` only applies to a routed resource, and `version` is then reserved: a field of that name is refused at load time.

## What it generates

- an integer `version` column on the model, `@default(1)`, incremented by every write the framework makes: update, soft delete and restore.
- `version` on the record view and in the selectable fields, so a client always holds the number it has to send back.
- a `version` on each update entry, or an `If-Match` header when the request carries a single entry.
- `versioned: { field: 'version', header: 'If-Match' }` in `GET /<resource>/describe`, and the same field in the OpenAPI document and the typed client (`<Name>UpdateItem.version`).

A resource generated this way needs a migration adding the column; `hery generate` patches the schema the same way it does for `deletedAt`.

## Sending the version

```http
POST /blog-posts/update
Content-Type: application/json

{ "data": [{ "id": "ckx...", "version": 3, "title": "Edited" }] }
```

A request with exactly one entry may send the version as `If-Match` instead, quoted the way an ETag is (`"3"` or `W/"3"`). The entry's own `version` wins when both are present. An `If-Match` on a request carrying several entries is a `400`, because the header cannot say which entry it speaks for, and so is `*` or anything that is not a quoted integer.

## What comes back

Update is a batch route, so a stale entry is rejected in its own slot of the results and the other entries are unaffected, the same as any other per-entry error:

| Situation                                | Entry status | `error.key`                 |
| ---------------------------------------- | ------------ | --------------------------- |
| version in the body does not match       | `409`        | `record.versionConflict`    |
| version in `If-Match` does not match     | `412`        | `record.preconditionFailed` |
| no version in the body and no `If-Match` | `428`        | `record.versionRequired`    |

`error.details` carries `resource`, `expected` and `current`, so a client can reload without another round trip. `current` is `null` when the entry lost a race against another save in the same instant and the winning version was not read.

Authorisation comes first: a caller who may not update the record gets the `403` for that entry, never a version error that would confirm the record exists at some version.

## Why it holds under concurrency

The service checks the version against the record the caller loaded, which is what produces `current`, and then repeats it in the write's own `where` clause (`WHERE id = ? AND version = ?`). The second check is the one that matters: two saves that both read version 3 cannot both match it, so exactly one is applied and the other is reported as a conflict.

## What it does not do

It does not merge. A conflicting save is refused whole and the client decides what to do with it. Delete and restore carry no patch to lose, so they do not ask for a version, but they do increment it, which means a client holding an older copy is refused when it tries to save over a record that was trashed and restored in between.

The GraphQL mutation and the MCP update tool take the version as a required argument on a versioned resource.
