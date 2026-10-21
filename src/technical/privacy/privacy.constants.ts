import { DEFAULT_JOB_POLICY } from '#technical/jobs/job-policy';
import type { JobPolicy } from '#technical/jobs/job-policy';

export const PRIVACY_PROCESS_JOB = 'privacy.process';

/**
 * Retried, because every step is safe to repeat: an export only reads, and an
 * erasure that already ran finds nothing left to delete or anonymise.
 */
export const PRIVACY_PROCESS_POLICY: JobPolicy = DEFAULT_JOB_POLICY;

export type PrivacyRequestKind = 'export' | 'erase-user' | 'erase-tenant';

export type PrivacyRequestStatus = 'pending' | 'running' | 'done' | 'failed';

export interface PrivacyJobData extends Record<string, unknown> {
  requestId: string;
  tenantId: string;
  userId: string | null;
  impersonatedBy: string | null;
}
