import { DEFAULT_JOB_POLICY } from '#kernel/jobs/job-policy';
import type { JobPolicy } from '#kernel/jobs/job-policy';

export const BILLING_MIRROR_JOB = 'billing.mirror';

/**
 * Retried, because mirroring an event is idempotent: it is an upsert keyed on
 * (provider, providerSubscriptionId), and replaying the same event twice
 * leaves the mirror exactly where a single successful run would have.
 */
export const BILLING_MIRROR_POLICY: JobPolicy = DEFAULT_JOB_POLICY;
