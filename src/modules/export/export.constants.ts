import { DEFAULT_JOB_POLICY } from '#technical/jobs/job-policy';
import type { JobPolicy } from '#technical/jobs/job-policy';

export const EXPORT_GENERATE_JOB = 'export.generate';
export const EXPORT_READY_NOTIFICATION = 'export.ready';

/**
 * Retried, because rendering is pure: the same rows laid out again produce the
 * same file, and nothing has been handed to anyone until the notification goes
 * out at the end.
 */
export const EXPORT_GENERATE_POLICY: JobPolicy = DEFAULT_JOB_POLICY;
