import type { JobsOptions } from 'bullmq';

/**
 * What a job does when it fails, declared once next to the job's own name
 * rather than spelled out at each dispatch site. Before this every job ran on
 * BullMQ's defaults -- one attempt, no retry, no backoff -- so a mail send
 * that hit a momentary DNS failure was simply lost, and the only sign was a
 * row in the dashboard nobody was watching.
 *
 * Four knobs, not BullMQ's full surface. A job that genuinely needs a fifth
 * option is a job whose queue deserves its own thinking, and widening this
 * type is how "one documented shape" turns back into a grab-bag.
 */
export interface JobPolicy {
  /** Total tries, not retries: 1 means "run once and give up". */
  attempts: number;
  /** First backoff step. Each later attempt doubles it. */
  backoffMs: number;
  /** Completed jobs kept for inspection before BullMQ trims them. */
  keepCompleted: number;
  keepFailed: number;
}

/**
 * Deliberately conservative: three attempts over roughly seven seconds covers
 * the failure this is actually for -- a restart, a dropped connection, a
 * provider blinking -- without turning a genuine error into twenty retries
 * against something that will never answer.
 *
 * Failed jobs are kept far longer than completed ones. A completed job is
 * evidence of nothing; a failed one is the only record of what went wrong.
 */
export const DEFAULT_JOB_POLICY: JobPolicy = {
  attempts: 3,
  backoffMs: 1000,
  keepCompleted: 100,
  keepFailed: 1000,
};

/**
 * A job that must not be retried says so explicitly. Retrying is wrong
 * wherever the work is not idempotent and a partial run already had an effect
 * a second run would repeat -- charging a card, posting to an endpoint that
 * does not deduplicate. The failed job still records that it happened, which
 * is what makes giving up safe rather than silent.
 */
export const RUN_ONCE_POLICY: JobPolicy = {
  ...DEFAULT_JOB_POLICY,
  attempts: 1,
};

export function jobOptions(
  policy: JobPolicy = DEFAULT_JOB_POLICY,
): JobsOptions {
  return {
    attempts: policy.attempts,
    backoff: { type: 'exponential', delay: policy.backoffMs },
    removeOnComplete: policy.keepCompleted,
    removeOnFail: policy.keepFailed,
  };
}
