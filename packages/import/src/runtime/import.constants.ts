import { DEFAULT_JOB_POLICY } from '#kernel/jobs/job-policy';
import type { JobPolicy } from '#kernel/jobs/job-policy';

export const IMPORT_CONSUME_JOB = 'import.consume';
export const IMPORT_DONE_NOTIFICATION = 'import.done';

/**
 * Retried only because `consume` is the application's own code and the rows it
 * was handed do not change between attempts. An importable that writes without
 * guarding against a repeat should declare RUN_ONCE_POLICY instead -- the
 * per-row outcome report is what tells you which it is.
 */
export const IMPORT_CONSUME_POLICY: JobPolicy = DEFAULT_JOB_POLICY;
