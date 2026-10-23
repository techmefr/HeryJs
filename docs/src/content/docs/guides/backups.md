---
title: Backups
description: Dump and restore the database with hery, run a dump on a schedule, how retention works, and what point-in-time recovery needs from you.
---

`hery db:backup` is a `pg_dump` with a file name, a retention count and a
restore that refuses to overwrite data. It is a **logical, point-in-time-of-the-dump**
backup: everything as it was when the dump started, nothing between two dumps.
For anything finer, see [Point-in-time recovery](#point-in-time-recovery), which
is yours to run, not HeryJs's.

## Requirements

`pg_dump` and `pg_restore` must be on the `PATH` of the machine that runs the
command, **in the same major version as the server or newer**. `pg_dump` refuses
to dump a server newer than itself, so a Postgres 17 database needs the 17 client
tools. HeryJs does not bundle them, and the default Node image does not have
them: a deployment that runs the scheduled backup needs them in its image.

## The commands

```bash
pnpm hery db:backup                  # backups/<database>-<UTC timestamp>.dump
pnpm hery db:backup --keep 14        # keep the newest 14, delete older ones
pnpm hery db:backup --no-compress    # an uncompressed dump
pnpm hery db:backups                 # list this database's dumps, newest first
pnpm hery db:restore latest          # restore the newest dump
pnpm hery db:restore app-20261021T030000Z.dump
```

The dump is the Postgres **custom format**, which is already compressed and is
what `pg_restore` reads directly. That is why compression is a level of the dump
(`--no-compress` turns it off) and not a gzip pass on top: a gzipped custom dump
would need unpacking before every restore and would save almost nothing. Owners
are not recorded (`--no-owner`), so a dump restores under whatever role the
`DATABASE_URL` connects as.

| Setting | Flag | Variable | Default |
| --- | --- | --- | --- |
| Directory | `--dir` | `BACKUP_DIR` | `backups` |
| Dumps kept | `--keep` | `BACKUP_KEEP` | `7` |

`backups/` is in the scaffolded `.gitignore`: a dump holds your data, and a data
dump does not belong in the repository.

## Restoring

```bash
pnpm hery db:restore latest
```

A restore **refuses when any table of the target database holds a row**, and
says so. An empty database passes, including one that was just migrated with
`prisma migrate deploy`: that is the normal target, and the dump replaces the
empty tables it finds. To overwrite a database that has data, pass `--force`.

Under the hood it is `pg_restore --clean --if-exists --single-transaction
--exit-on-error`: the restore is one transaction, so a failure leaves the
database as it was instead of half restored. `--clean` drops only the objects
the dump contains. A table that exists in the target but not in the dump is
left alone, so restore into a fresh database when you need exactly the dump's
contents.

The command restores into `DATABASE_URL`. To rehearse a restore without touching
anything real, create a copy with `hery db:branch create rehearsal`, point
`DATABASE_URL` at it, and restore there.

### Erasures survive a restore

A dump taken before a privacy erasure still holds the erased person. Every
completed erasure is therefore appended to a journal kept **outside the
database**. In production, set `PRIVACY_ERASURE_STORAGE_DRIVER` to an installed
storage driver (`s3` for S3 or MinIO): each erasure is written as one object
under `privacy/erasures/`, shared by every instance and kept across redeploys.
Without it the journal falls back to the local file `PRIVACY_ERASURE_JOURNAL`
(default `privacy/erasures.jsonl`), fine for development but lost with the
container unless it sits on a volume, and seen by one instance only. It
holds ids only: the tenant, the erased user, and for a tenant erasure the
account that was kept. `hery db:restore` and the admin panel's restore run the
whole journal again once the dump is back; an erasure that finds nothing left
to erase is a no-op. To run it by hand, after restoring with `pg_restore`
yourself for instance:

```bash
pnpm hery privacy:replay
```

Keep the journal on a volume that outlives the database and is never part of
the dumps, and back it up separately.

## Running it on a schedule

The kernel registers a `database-backup` task that runs **daily at 03:00** inside
the application and records its runs like any other scheduled task (see
`GET /scheduler/tasks`). It is off until you turn it on:

```bash
BACKUP_ENABLED="true"
BACKUP_DIR="/var/backups/app"
BACKUP_KEEP="14"
```

Like every `@Cron`, it fires on each instance, and the scheduler's per-task lock
keeps two instances from dumping at once. A run that cannot find `pg_dump` fails
and is recorded as failed, so the missing tool is visible rather than a quiet
absence of backups.

To keep dumps off the machine that produced them, name an installed storage
driver:

```bash
BACKUP_STORAGE_DRIVER="local"   # or the name of your S3 driver
```

After the local dump is written, the task uploads it to the driver under
`backups/<file name>`. Uploading belongs to the scheduled task and not to the
CLI, which is not a Nest application and has no drivers to resolve.

## Retention

Retention is a **count**, not an age: after each dump, the newest `BACKUP_KEEP`
dumps of that database are kept in the directory and the rest are deleted. Only
files that match `<database>-<timestamp>.dump` are ever touched, so other files
and other databases' dumps in the same directory are safe. Two things follow:

- A count means that a run that stops running also stops deleting. Seven daily
  dumps cover seven days only while the task keeps working. Watch the task's
  status.
- Retention does **not** reach the storage driver. The driver contract has no
  listing, so objects uploaded there are never deleted by HeryJs. Put a lifecycle
  rule on the bucket (S3 expiry, for instance) to bound that copy.

## Point-in-time recovery

A dump restores the database to the moment it started. Everything written since
the last dump is lost, so with a daily task your worst case is nearly a day of
data. If that is too much, you have two options, and neither is something
HeryJs does for you:

1. **Dump more often.** Run `hery db:backup` from your own scheduler every hour.
   The cost is a full dump each time.
2. **Archive the WAL.** Point-in-time recovery to a chosen second needs a base
   backup plus continuous WAL archiving (`archive_mode`, `archive_command`, then
   `recovery_target_time` on restore). That is configured on the Postgres server
   and run by whoever operates it: your cloud provider's managed Postgres, or a
   tool such as pgBackRest or WAL-G on a server you run. It is not part of this
   framework, and `hery db:backup` does not replace it.

If your Postgres is managed, check that your provider's point-in-time recovery
is switched on and how far back it reaches. Treat the dumps here as the
portable second copy: they restore on any Postgres of the same or a newer
major version, and they survive losing the provider.

## Test your restores

A dump nobody has restored is a hope. Rehearse it: restore the latest dump into
a throwaway database on a regular basis and run `hery migrate:status --check`
against it. The repository's own CI does the round trip against a real
Postgres on every push, but that proves the mechanism, not your data.

## From the admin panel

Everything above is also in the [admin panel](../admin/), under **Backups**:
the list of dumps with their size, date and status, a **Back up now** button,
**Download** and **Restore** per dump, and a form for the schedule (on or off, the
cron expression) and the retention count. Restore asks you to type the dump's name
first. Saving the schedule replaces the running job, so it applies without a
restart.

The panel is built on routes you can call yourself, all gated by the
`canManageBackups` capability (administrators only):

| Route | Does |
| --- | --- |
| `GET /backups` | Lists the dumps (name, date, size, status). |
| `POST /backups` | Creates one now. |
| `GET /backups/schedule` | The schedule, retention and the last run. |
| `PUT /backups/schedule` | Edits `{ enabled, cron, keep }`; a bad cron expression is a 400. |
| `GET /backups/:name/download` | Streams a dump. Only names in the list resolve. |
| `POST /backups/:name/restore` | Restores it. The body must be `{ "confirm": "<name>" }`, or it is a 400 and nothing happens. |

The saved schedule lives in `settings.json` inside the backup directory, per
machine, next to the dumps it governs; until someone saves, `BACKUP_ENABLED`,
`BACKUP_CRON` and `BACKUP_KEEP` are the settings. On more than one instance each
keeps its own directory and settings, so edit the schedule where the dumps live.
