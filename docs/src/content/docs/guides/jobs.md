---
title: Jobs
description: Background work on BullMQ, with one declared retry policy per job instead of a retry story reinvented per project.
---

Anything slow enough to keep a request waiting goes on a queue: sending mail,
rendering an export, parsing an upload, running a queued listener. The queue is
BullMQ over the Valkey the kernel already depends on.

Before this convention existed, `JobsService` was a bare `queue.add(name, data)`
and every job inherited BullMQ's defaults — **one attempt, no retry, no
backoff**. A mail send that hit a momentary DNS failure was simply lost, and the
only trace was a row in a dashboard nobody was watching.

## A job's failure behaviour is declared next to its name

```ts
export const MAIL_SEND_JOB = 'mail.send';

export const MAIL_SEND_POLICY: JobPolicy = DEFAULT_JOB_POLICY;
```

The policy lives beside the job name because that is the one place every
dispatch site already imports from. Spelling the options out at each dispatch
means two call sites drift, and the one that matters is always the one nobody
updated.

```ts
await this.jobs.dispatch(MAIL_SEND_JOB, payload, MAIL_SEND_POLICY);
await this.jobs.dispatchTo(
  EXPORT_QUEUE,
  EXPORT_GENERATE_JOB,
  payload,
  EXPORT_GENERATE_POLICY,
);
```

## Four knobs, deliberately

```ts
export interface JobPolicy {
  attempts: number;
  backoffMs: number;
  keepCompleted: number;
  keepFailed: number;
}
```

`attempts` is total tries, not retries: `1` means run once and give up.
`backoffMs` is the first step, doubled on each later attempt.

BullMQ offers far more than this. **Widening `JobPolicy` is how "one documented
shape" turns back into a grab-bag**, so a job that genuinely needs a fifth
option is a job whose queue deserves its own thinking rather than a new field
here.

## The default is three attempts over about seven seconds

`DEFAULT_JOB_POLICY` retries three times with exponential backoff from one
second. That covers what this is actually for — a restart, a dropped
connection, a provider blinking — without turning a genuine error into twenty
retries against something that will never answer.

Failed jobs are kept ten times longer than completed ones. A completed job is
evidence of nothing; a failed one is the only record of what went wrong.

## Not every job should be retried

```ts
export const CHARGE_CARD_POLICY: JobPolicy = RUN_ONCE_POLICY;
```

Retrying is wrong wherever the work is not idempotent and a partial run already
had an effect a second run would repeat — charging a card, posting to an
endpoint that does not deduplicate. `RUN_ONCE_POLICY` says so explicitly. The
failed job still records that it happened, which is what makes giving up safe
rather than silent.

The shipped policies and why each is what it is:

| Job               | Policy  | Reason                                                                                   |
| ----------------- | ------- | ---------------------------------------------------------------------------------------- |
| `mail.send`       | default | What fails is the transport, not the message, and MailLog records the outcome either way |
| `export.generate` | default | Rendering is pure, and nothing is handed to anyone until the notification at the end     |
| `import.consume`  | default | The rows do not change between attempts — but see below                                  |
| `event.dispatch`  | default | A queued listener is retried as a unit, rebuilt from the same payload                    |

`import.consume` is the one to think about in your own code: `consume` is
**your** code, and an importable that writes without guarding against a repeat
should declare `RUN_ONCE_POLICY` instead. The per-row outcome report is what
tells you which kind you have.

## One queue per processor family

`jobs.constants.ts` declares a queue per family — mail, webhooks, exports,
imports, events. This is not tidiness.

BullMQ hands a job to whichever registered worker is idle, and `job.name` is
only a label. Every processor guards with `if (job.name !== …) return;`, and a
worker that returns **completes the job without doing the work**. Two families
sharing a queue therefore silently swallow each other's jobs — the failure has
no error, no retry and no dead letter, because as far as BullMQ is concerned
the job succeeded.

Adding a processor means adding a queue in `jobs.constants.ts`, registering it
in `JobsModule`, and dispatching through `dispatchTo`.

## Watching what failed

`/jobs` mounts Bull Board outside production. It is **unauthenticated and
cross-tenant**, which is why it is not mounted in production at all.
