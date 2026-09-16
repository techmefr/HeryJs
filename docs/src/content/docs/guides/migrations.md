---
title: Migrations
description: Prisma migrations plus the row-level-security pass HeryJs appends, and what reverting one actually means.
---

Schema changes go through Prisma. `pnpm hery migrate --name <name>` wraps
`prisma migrate dev` and adds two things Prisma does not do on its own.

## What `hery migrate` adds

**A row-level-security pass.** A tenant-scoped model needs a Postgres policy
behind the extension that scopes it. Writing that by hand is what got forgotten
for the teams tables once, so the policy is emitted from the schema and
`TENANT_SCOPED_MODELS` rather than remembered: after the tables exist, a second
migration is written for any model still missing one, then applied.

**A client regeneration.** `prisma migrate dev` does not always regenerate the
client — applying an already-authored migration leaves the previous one in
place — while still reporting that the database is in sync with the schema.
Those two statements together are a trap worth naming: a table exists, the
client does not know about it, and the failure surfaces far from its cause.
`hery migrate` now always regenerates.

## Reverting

Prisma has no down migration, and that is not an omission it will grow out of:
a migration is a forward SQL script, and the state before it exists only as
"the migrations that came earlier".

`pnpm hery migrate:down` derives the revert instead. It copies the migration
history, drops its last entry, and asks Prisma to diff the live database
against that earlier history. The SQL closing that gap is the down script.

```bash
pnpm hery migrate:down                      # prints the SQL
pnpm hery migrate:down --apply              # runs it
```

It needs an empty database to replay the earlier history into, passed as
`--shadow-database-url` or `SHADOW_DATABASE_URL`. It refuses rather than
borrowing the real one, because replaying a history into a database drops what
is already in it.

**Nothing is applied by default, and that is the point.** A diff reverts
_shape_, not _content_: dropping a column reverts the schema and takes every
value in it, and no migration brings those back. Read the SQL first.

After a successful `--apply`, the reverted migration is **still in the
directory**. Delete it, or the next `hery migrate` replays exactly what you
just undid.

## Reverting a migration that carried an RLS policy

This is the edge worth knowing before you hit it. The RLS migration is a
separate, framework-owned directory written _after_ the Prisma one, so the two
revert independently and in the wrong order by default.

Reverting only the Prisma migration leaves a policy pointing at a column that
no longer exists — every query against that table then fails, including the
ones that have nothing to do with the change. Revert the RLS migration first,
or delete both directories and re-run `hery migrate` to have the pass rewrite
the policy from the schema as it now stands.

The same asymmetry applies to a squash: squashing Prisma migrations without
squashing the RLS ones leaves policies whose `CREATE POLICY` statements
reference an intermediate shape. `pnpm lint:rls` is what catches a model whose
policy went missing; it does not catch a policy that outlived its column.

## In production

`migrate:down` is a development tool. In production a revert is a **forward
migration** that undoes the change deliberately, written and reviewed like any
other — with an explicit data plan for whatever the schema change dropped.
Deriving a revert from a diff is fine when losing a column's contents costs
nothing; it is never fine when it costs a customer's data.
