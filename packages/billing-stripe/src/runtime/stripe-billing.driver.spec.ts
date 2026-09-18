import { createHmac } from 'node:crypto';
import {
  BillingEventUnattributedException,
  BillingWebhookSignatureException,
} from '#kernel/billing/billing-driver';
import { StripeBillingDriver } from './stripe-billing.driver';

const SECRET = 'whsec_test_secret';

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  delete process.env.STRIPE_SIGNATURE_TOLERANCE_SECONDS;
});

afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

function sign(payload: string, timestamp: number): string {
  const signature = createHmac('sha256', SECRET)
    .update(String(timestamp))
    .update('.')
    .update(payload)
    .digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

function subscriptionEvent(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_123',
        status: 'active',
        current_period_end: 1_700_000_000,
        metadata: { tenantId: 'tenant-1', plan: 'pro' },
        ...overrides,
      },
    },
  });
}

describe('StripeBillingDriver', () => {
  const driver = new StripeBillingDriver();

  it('parses a subscription event signed with the real secret', () => {
    const body = subscriptionEvent();
    const header = sign(body, Math.floor(Date.now() / 1000));

    const [event] = driver.parseWebhook(Buffer.from(body), header);

    expect(event).toEqual({
      provider: 'stripe',
      subscriptionId: 'sub_123',
      tenantId: 'tenant-1',
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(1_700_000_000 * 1000),
    });
  });

  it('refuses a signature computed with the wrong secret', () => {
    const body = subscriptionEvent();
    const header = `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`;

    expect(() => driver.parseWebhook(Buffer.from(body), header)).toThrow(
      BillingWebhookSignatureException,
    );
  });

  it('refuses a header missing the timestamp or the v1 signature', () => {
    expect(() =>
      driver.parseWebhook(Buffer.from(subscriptionEvent()), 'garbage'),
    ).toThrow(BillingWebhookSignatureException);
  });

  /**
   * A replayed webhook, captured once and resent later, is exactly what the
   * timestamp tolerance exists to refuse -- the signature alone would still be
   * valid forever.
   */
  it('refuses a signature outside the tolerance window', () => {
    const body = subscriptionEvent();
    const staleTimestamp = Math.floor(Date.now() / 1000) - 600;
    const header = sign(body, staleTimestamp);

    expect(() => driver.parseWebhook(Buffer.from(body), header)).toThrow(
      BillingWebhookSignatureException,
    );
  });

  it('maps a canceled deletion event regardless of the object status field', () => {
    const body = JSON.stringify({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          status: 'active',
          current_period_end: 1_700_000_000,
          metadata: { tenantId: 'tenant-1', plan: 'pro' },
        },
      },
    });
    const header = sign(body, Math.floor(Date.now() / 1000));

    const [event] = driver.parseWebhook(Buffer.from(body), header);

    expect(event?.status).toBe('canceled');
  });

  it('folds unpaid into past_due', () => {
    const body = subscriptionEvent({ status: 'unpaid' });
    const header = sign(body, Math.floor(Date.now() / 1000));

    const [event] = driver.parseWebhook(Buffer.from(body), header);

    expect(event?.status).toBe('past_due');
  });

  it('refuses an event with no tenantId in its metadata', () => {
    const body = subscriptionEvent({ metadata: { plan: 'pro' } });
    const header = sign(body, Math.floor(Date.now() / 1000));

    expect(() => driver.parseWebhook(Buffer.from(body), header)).toThrow(
      BillingEventUnattributedException,
    );
  });

  it('refuses an event with no plan in its metadata', () => {
    const body = subscriptionEvent({ metadata: { tenantId: 'tenant-1' } });
    const header = sign(body, Math.floor(Date.now() / 1000));

    expect(() => driver.parseWebhook(Buffer.from(body), header)).toThrow(
      BillingEventUnattributedException,
    );
  });

  /**
   * invoice.payment_failed carries nothing this module needs that
   * customer.subscription.updated does not already say -- Stripe flips the
   * subscription's own status to past_due on the same failure.
   */
  it('returns no events for a type it does not mirror', () => {
    const body = JSON.stringify({
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_123' } },
    });
    const header = sign(body, Math.floor(Date.now() / 1000));

    expect(driver.parseWebhook(Buffer.from(body), header)).toEqual([]);
  });
});
