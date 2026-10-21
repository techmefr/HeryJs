---
title: GDPR export and erasure
description: Export everything held about a user, erase a user or a whole tenant, and keep an audit trail that records the request without keeping the data.
---

Retention pruning removes rows that were already deleted. A privacy request is the other half: a person, or an operator on their behalf, asks for everything held about them, or asks for it to be gone. The kernel runs both, and each resource only declares what its rows are.

## Declaring a resource

```yaml
name: BlogPost
erasure: anonymise

fields:
  - name: title
    type: string
    personal: true
  - name: privateNote
    type: encrypted
    optional: true
    personal: true
```

- `erasure: delete` removes every row the user owns, hard. Use it when nothing else points at the rows.
- `erasure: anonymise` keeps the rows and rewrites the fields marked `personal: true`: `null` where the column is optional, otherwise `[erased]`, `0`, `false` or the epoch. Use it when other rows still reference them.
- A resource that declares no `erasure` takes no part: it is neither exported nor erased.

Every declared field is exported, hidden and encrypted ones included and opened, because what a person may ask for is everything held about them. The blueprint is checked: `personal` needs an `erasure`, `anonymise` needs at least one personal field, `delete` takes none, and only a routed resource can declare one (the rows are found through `ownerId`).

`hery generate` writes a `<name>.personal-data.ts` that registers the declaration with the kernel, the way a resource registers with the change feed, and imports `PrivacyModule`.

## The routes

| Route | Who | What |
| --- | --- | --- |
| `POST /privacy/exports` `{ userId? }` | the user, or an admin for anyone in the tenant | export the user's rows and identity |
| `POST /privacy/erasures/user` `{ userId }` | the user, or an admin | erase that user |
| `POST /privacy/erasures/tenant` `{ confirm }` | an admin, for their own tenant | erase the tenant; `confirm` must equal the tenant id |
| `GET /privacy/requests` | admin: all, others: their own | request history and status |
| `GET /privacy/requests/:id` | the requester, or an admin | one request; a finished export returns its bundle once |

Every `POST` answers `202` with a request. The work runs on the `heryjs-privacy` queue, in the requester's tenant context, through the tenant-scoped client, so the tenant boundary, row-level security and the audit extension apply as for any write. It is retried safely: an erasure that already ran finds nothing left to do. Routes are rate limited on the `write` and `read` buckets.

An export's bundle is stored in the request row only until it is collected, then cleared. Asking again is a new export.

## What an erasure does

1. For each declared resource, in an order that respects foreign keys, it redacts the audit entries that described the erased rows, then deletes or anonymises them.
2. It deletes everything keyed to the user by `userId` (sessions, accounts, API keys, passkeys, second factors, notification settings and so on, read from Prisma's schema) and rewrites the user row to a tombstone: same id, a pseudonymous `erased-<hash>@erased.invalid` email, no name, no image, no phone, banned.
3. A tenant erasure does the same for every row of the declared resources and every user of the tenant **except the requester**, whose session is needed to read the outcome. Erase that user afterwards.

A self-erasure ends the requester's own sessions, so its outcome is read from the history by an admin.

## What the audit trail keeps

The trail is a hash chain, and an entry's hash covers its payload, so deleting a payload would break verification. An entry about an erased row is therefore **redacted**, not removed: its `data` becomes `{ "redacted": true, "digest": "<sha256 of the canonical payload>" }` and `redactedAt` is set. Its place, its links, who acted and when are untouched, so the next entry still links to it and `GET /audit-logs/verify` still passes. The verifier checks a redacted entry's links and that it holds exactly that marker; it can no longer recompute the entry's own hash. That is a real, deliberate loss: tampering with the actor of a redacted entry is not caught by the hash, only by the links around it.

The request is audited as `privacy.<kind>.requested` and `privacy.<kind>.completed`, carrying the request id, the subject id and counts per model, never the data. The subject id and the `userId` of past entries remain: after erasure they are opaque ids that no longer map to a person.

## What it does not cover

- Unrouted resources reached through a parent have no owner and are not found; give them a routed blueprint of their own, or let the database cascade.
- Copies outside the database: search indexes, outbox messages, webhook payloads, logs, uploaded files, backups.
- Bulk audit entries (`updateMany`, `deleteMany`) carry only a count and are not redacted for a single user.
- Tenant-level records that are not personal data of a user (teams, billing subscription, SSO connections) are left.

## The admin page

The admin panel lists `GET /privacy/requests` as a section from introspection alone. Its Privacy page adds what introspection cannot: request an export for a user id and download the JSON, erase a user or a tenant behind a prompt where the operator types the id to confirm, and see the history refresh with each request's status.
