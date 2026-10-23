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

## Chains, batches and resume

`JobFlowsService` (from `JobFlowsModule`) runs several jobs as one unit, on top
of BullMQ flows. A **chain** runs steps one after the other; a **batch** runs
jobs independently and then a completion callback.

```ts
await this.flows.chain({
  name: 'monthly-report',
  steps: [
    { name: 'report.query', data: { month } },
    { name: 'report.render' },
    { name: 'report.mail' },
  ],
});

await this.flows.batch({
  name: 'import-customers',
  jobs: chunks.map((rows) => ({ name: 'import.chunk', data: { rows } })),
  onComplete: { name: 'import.summary' },
});
```

A step with no `queue` runs on the flow queue, where the handler registered
under its name runs it. A step that names a queue (`EXPORT_QUEUE`, say) goes to
that queue's own processor, so a long export or import chains onto the
processors that already exist. `queue` on the call sets the default for every
step that names none.

```ts
handlers.register('report.render', ({ previous, data, tenantId }) => {
  return render(previous);
});
```

`JobFlowHandlers.register` takes the step name and a function; the handler
runs inside the tenant the flow was started under, receives what the previous
step returned (`previous`) or, for a batch callback, what every job returned
(`results`), and returns a JSON-serialisable value. Flow jobs carry the
`tenantId` and `flow` fields in their data, so do not use those names.

An unknown step name **fails** the step instead of completing it, unlike the
per-family processors above: a flow queue exists only for flows, so a name
nobody handles is a missing registration.

### Resume

The whole tree is created in one Redis call, so a flow survives a worker
restart like any queued job. A step that exhausted its attempts stays `failed`
and the steps after it stay `waiting-children`; nothing else is touched.
`retry` re-queues the failed steps with a fresh set of attempts and the flow
carries on, and the steps that completed are never run again. A batch with a
failed job keeps its callback waiting in the same way.

Jobs of a flow, and its registry row, are kept for seven days
(`FLOW_RETENTION_DAYS`): a flow is resumable as long as its failed job exists,
so the window is a time, not a count.

### Operating flows from the admin

| Route                                     | Capability          | Purpose                                 |
| ----------------------------------------- | ------------------- | --------------------------------------- |
| `GET /job-flows`                          | `canReadJobFlows`   | paged flows with state and progress     |
| `GET /job-flows/definitions`              | `canReadJobFlows`   | flows an operator can start by name     |
| `GET /job-flows/:id`                      | `canReadJobFlows`   | one flow with the state of every step   |
| `POST /job-flows/definitions/:name/start` | `canManageJobFlows` | start a defined flow with an `input`    |
| `POST /job-flows/:id/retry`               | `canManageJobFlows` | retry the failed steps                  |
| `POST /job-flows/:id/cancel`              | `canManageJobFlows` | drop what has not run (409 if one runs) |

Both capabilities are admin-only, bound to the caller's tenant: a flow of
another tenant answers 404. The two argument-free `GET` routes appear as
sections in the admin from introspection, and the **Job flows** page adds the
actions: start a defined flow, see the steps of a flow and why one failed,
retry, cancel. A flow becomes startable from there once the shape is declared
in code:

```ts
flows.define(
  'monthly-report',
  (input) => ({ kind: 'chain', name: 'monthly-report', steps: [/* ... */] }),
  'Build and mail the monthly report',
);
```

## Watching what failed

`/jobs` mounts Bull Board in the environments listed in
`devTools.environments`, never in production. It reads, retries and removes
the jobs of **every tenant**, so it opens for the platform operator only
(`PLATFORM_OPERATOR_IDS`), whose session or API key goes in the
`Authorization: Bearer` header; any other caller, a tenant admin included,
gets a 404. The admin panel's [Job flows](#chains-batches-and-resume) page and
the jobs tab of the [Dev dashboard](../dev-dashboard/) are the per-tenant views.
