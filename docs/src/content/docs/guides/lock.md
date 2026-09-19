---
title: Distributed lock
description: "\"Only one of these may run at a time,\" across every instance a project runs, not only inside one."
---

`@Cron` fires on every instance. Two pods means every scheduled task runs
twice; three means three times. Before this, nothing in the framework said
so — a project discovers it through a doubled counter, a mail sent twice, or a
prune sweep racing itself.

## Scheduled tasks get this for free

`ScheduledTaskStore.run` takes the task's own name as a lock, so every
existing task — `heartbeat`, `prune`, `impersonation-expiry` — gained
cluster-wide exclusivity with no change at its call site.

**Contention is skipped silently**, on purpose: if another instance already
holds the lock, it is already doing the work, so this one has nothing useful
to do. That is the right default for a cron and the wrong one for a job — see
below.

## `LockService`, for everything else

"Only one of these may run at a time" is not only a scheduler problem, so the
primitive is available directly:

```ts
const outcome = await this.locks.runExclusively('reindex-catalog', async () => {
  await this.reindex();
});
// 'ran' | 'skipped'
```

`runExclusively` is the scheduler's own shape: run if you can get the lock,
skip otherwise. **A job wanting a different answer on contention calls
`acquire` directly** and decides for itself — retry, fail the job, queue a
follow-up:

```ts
const lock = await this.locks.acquire('export:report-42');

if (!lock) {
  // This job's own call: fail it, retry it, queue a follow-up. The lock
  // primitive does not decide this on your behalf.
  throw new Error('report-42 is already being generated');
}

try {
  await this.generate();
} finally {
  await lock.release();
}
```

The primitive never picks one answer for both cases. A scheduler-shaped
default — skip silently — is exactly the wrong default for a job whose caller
is waiting on the result.

## Why a crashed holder is not a permanent outage

A lock is acquired with a TTL (30 seconds by default) and renewed by a
heartbeat at a third of that while the holder is alive. Two failure modes,
handled differently on purpose:

- **The holder crashes.** The heartbeat stops with it, the TTL expires, and
  the lock frees itself. No lock outlives the process that held it by more
  than a heartbeat interval.
- **The holder is merely slow.** The heartbeat keeps renewing for as long as
  the process is alive, so a task that runs longer than the TTL keeps its
  lock instead of a second instance acquiring the same one underneath it.

**Every renewal and every release is compare-and-set against a token minted at
acquire time**, not a bare key delete. Without it, a holder whose TTL already
expired — and whose key a second instance has since acquired — would delete
that second instance's lock on its way out: a lock two instances now believe
neither of them holds. The token is what makes a stale release a no-op instead
of stealing someone else's turn.
