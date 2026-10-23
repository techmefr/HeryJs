import type { JobPolicy } from '#technical/public/jobs';

export const INBOUND_WEBHOOK_HANDLER = 'inbound-webhooks';
export const INBOUND_WEBHOOK_MESSAGE = 'inbound-webhook.received';
export const INBOUND_WEBHOOK_JOB = 'webhook.process';

export const WEBHOOK_ID_HEADER = 'x-webhook-id';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-webhook-timestamp';
export const MAX_DELIVERY_ID_LENGTH = 255;

/**
 * Six tries with the delay doubling from 5 seconds, so the last one lands about
 * two and a half minutes after the first: enough to ride out a handler's
 * dependency restarting. The processor skips an event already processed, so a
 * retry never runs one twice.
 */
export const INBOUND_WEBHOOK_POLICY: JobPolicy = {
  attempts: 6,
  backoffMs: 5_000,
  keepCompleted: 100,
  keepFailed: 1000,
};
