import { DEFAULT_JOB_POLICY } from '#kernel/jobs/job-policy';
import type { JobPolicy } from '#kernel/jobs/job-policy';

export const MAIL_SEND_JOB = 'mail.send';

/**
 * Retried, because what fails here is almost always the transport rather than
 * the message: a provider blinking, DNS, a dropped connection. The driver
 * throws only on an explicit refusal or a transport error, and the MailLog row
 * records the outcome either way, so a retry cannot hide a permanent failure.
 */
export const MAIL_SEND_POLICY: JobPolicy = DEFAULT_JOB_POLICY;
