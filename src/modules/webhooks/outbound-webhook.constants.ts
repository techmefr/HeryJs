import type { JobPolicy } from '#technical/jobs/job-policy';

export const OUTBOUND_WEBHOOK_HANDLER = 'outbound-webhooks';
export const OUTBOUND_WEBHOOK_JOB = 'webhook.deliver';

/**
 * What a customer can subscribe to. A message reaches a subscriber only if it
 * was staged under `webhook.` on purpose, or if it is a `model.*` change, whose
 * payload is ids and field names by contract. An `event:` message carries the
 * whole event object, which was never written with a third party in mind, so it
 * is not deliverable.
 */
export const WEBHOOK_EVENT_PREFIX = 'webhook.';
export const MODEL_EVENT_PREFIX = 'model.';
export const DELIVERABLE_PREFIXES: readonly string[] = [
  WEBHOOK_EVENT_PREFIX,
  MODEL_EVENT_PREFIX,
];

export const DELIVERY_STATUS_PENDING = 'pending';
export const DELIVERY_STATUS_DELIVERED = 'delivered';
export const DELIVERY_STATUS_DEAD = 'dead';
export const DELIVERY_STATUSES = [
  DELIVERY_STATUS_PENDING,
  DELIVERY_STATUS_DELIVERED,
  DELIVERY_STATUS_DEAD,
] as const;

export const MAX_SUBSCRIPTIONS_PER_TENANT = 20;
export const MAX_EVENTS_PER_SUBSCRIPTION = 20;

export const SIGNATURE_SCHEME = 'v1';
export const DELIVERY_TIMEOUT_MS = 10_000;
export const DELIVERY_ERROR_MAX_LENGTH = 500;

/**
 * Ten tries with the delay doubling from 10 seconds, so the last retry lands
 * about 85 minutes after the first attempt: long enough to ride out a customer's
 * deploy, short enough that a dead endpoint shows up in the log the same day.
 */
export const DELIVERY_POLICY: JobPolicy = {
  attempts: 10,
  backoffMs: 10_000,
  keepCompleted: 100,
  keepFailed: 1000,
};

export const OUTBOUND_WEBHOOK_POLICY = Symbol('OUTBOUND_WEBHOOK_POLICY');
