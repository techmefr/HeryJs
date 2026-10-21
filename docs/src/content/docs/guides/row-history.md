---
title: Row history
description: Opt-in per-resource snapshots with a diff view and a restore that goes through the normal update path.
---

Audit is a change log and `versioned` only guards concurrency. History is the third thing: restorable snapshots.

```yaml
name: Snippet
history: true
```

## What is stored

Every create, update, soft delete and restore writes one `RecordSnapshot` row: the record as it stood after the write, who wrote it, and the operation (`create`, `update`, `delete`, `restore` or `revert`). The columns kept are registered in `HISTORY_COLUMNS` by `hery generate`, and a field that is `hidden` or `encrypted` is never registered, so it is never stored, not merely filtered later. `version` and `deletedAt` are kept when the resource has them.

Writes made through the resource's Prisma client are recorded. `updateMany`, `deleteMany`, `createMany` and raw SQL are not, because their result carries no rows. A hard delete (and purge, and prune of a trashed row) removes the record's history with it.

## Routes

| Route | Gate | Purpose |
| --- | --- | --- |
| `POST /:id/history` | view preset | entries, newest first. Body `{ limit?, before? }`; `meta.nextBefore` is the cursor |
| `POST /:id/history/diff` | view preset | body `{ from, to? }`; compares an entry with another, or with the record now |
| `POST /:id/history/restore` | update preset | body `{ snapshotId, version? }` |

Restore writes the snapshot's fields through the same update as an edit: the update policy, the version check (send `version`, or `If-Match`, on a versioned resource), the audit entry and the change feed all apply, and the restore becomes the newest entry. A trashed record is refused; bring it back from the bin first. A column added after the snapshot was taken is left as it is.

`history` and `revert` are resolved per record when a search names them in `capabilities`, which is how the admin enables its buttons.

## Retention

`RecordSnapshot` is a prune target like any soft-deletable model: set `prune.default` or `prune.overrides.RecordSnapshot` in `hery.config.ts`. Snapshots older than the retention are deleted record by record, and the newest snapshot of a record is always kept. The [prune page](../prune/) of the admin lists it and can run it.

## Admin

A resource with history shows a **History** button on each row. It lists the entries, shows a diff against the current record and restores an entry, with the button enabled only when the API's `revert` decision allows it. Nothing else is needed: the page reads `history: true` from `GET /describe`.
