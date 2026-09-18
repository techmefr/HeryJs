import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  BillingEventUnattributedException,
  BillingWebhookSignatureException,
} from '#kernel/billing/billing-driver';
import type {
  BillingDriver,
  BillingEvent,
  BillingSubscriptionStatus,
} from '#kernel/billing/billing-driver';
import { stripeBillingEnv } from './stripe-billing.env';

/**
 * node:crypto only, no Stripe SDK. The whole verification is one documented
 * formula -- HMAC-SHA256 of `${timestamp}.${payload}` -- and installing an SDK
 * to compute one HMAC is the same trade `mail-resend` already declined: a
 * dependency to audit and upgrade for a handful of lines every project would
 * otherwise have to trust unread.
 */
const SIGNATURE_HEADER_PATTERN = /(?:^|,)\s*(t|v1)=([^,]+)/g;

function parseSignatureHeader(
  header: string,
): { timestamp: string; signature: string } | null {
  const found: Record<string, string> = {};

  for (const match of header.matchAll(SIGNATURE_HEADER_PATTERN)) {
    found[match[1] as string] = match[2] as string;
  }

  return found.t && found.v1
    ? { timestamp: found.t, signature: found.v1 }
    : null;
}

function verify(rawBody: Buffer, header: string): void {
  const env = stripeBillingEnv();
  const parsed = parseSignatureHeader(header);

  if (!parsed) {
    throw new BillingWebhookSignatureException();
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(parsed.timestamp));

  if (
    !Number.isFinite(ageSeconds) ||
    ageSeconds > env.STRIPE_SIGNATURE_TOLERANCE_SECONDS
  ) {
    throw new BillingWebhookSignatureException();
  }

  const expected = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET)
    .update(parsed.timestamp)
    .update('.')
    .update(rawBody)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(parsed.signature, 'hex');

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new BillingWebhookSignatureException();
  }
}

/**
 * Stripe's own statuses, collapsed into the five this module mirrors.
 * `unpaid` -- every retry has failed and Stripe has given up dunning -- has no
 * exact match; it is treated as `past_due` rather than `canceled` because the
 * subscription is not actually canceled yet and a project may still want to
 * grant a grace period through it. `incomplete_expired` folds into
 * `incomplete` for the same reason `unpaid` folds into `past_due`: this module
 * mirrors five states, not eight.
 */
function toStatus(stripeStatus: string): BillingSubscriptionStatus {
  switch (stripeStatus) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    default:
      return 'incomplete';
  }
}

interface StripeSubscriptionObject {
  id: string;
  status: string;
  current_period_end: number;
  metadata?: Record<string, string>;
}

interface StripeEvent {
  type: string;
  data: { object: unknown };
}

/**
 * Only `customer.subscription.*` becomes a BillingEvent. Stripe flips a
 * subscription's own `status` to `past_due` on a failed invoice payment, so
 * `invoice.payment_failed` carries nothing this module needs that
 * `customer.subscription.updated` does not already say -- reaching into an
 * invoice's line items to reconstruct a plan and a period end would be
 * guessing at a shape this driver has no need to guess at.
 */
function toBillingEvent(event: StripeEvent): BillingEvent[] {
  if (!event.type.startsWith('customer.subscription.')) {
    return [];
  }

  const object = event.data.object as StripeSubscriptionObject;
  const tenantId = object.metadata?.tenantId;
  const plan = object.metadata?.plan;

  if (!tenantId || !plan) {
    throw new BillingEventUnattributedException(event.type);
  }

  return [
    {
      provider: 'stripe',
      subscriptionId: object.id,
      tenantId,
      plan,
      status:
        event.type === 'customer.subscription.deleted'
          ? 'canceled'
          : toStatus(object.status),
      currentPeriodEnd: new Date(object.current_period_end * 1000),
    },
  ];
}

@Injectable()
export class StripeBillingDriver implements BillingDriver {
  parseWebhook(rawBody: Buffer, signatureHeader: string): BillingEvent[] {
    verify(rawBody, signatureHeader);

    const event = JSON.parse(rawBody.toString('utf8')) as StripeEvent;

    return toBillingEvent(event);
  }
}
