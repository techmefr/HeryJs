import { createHmac } from 'node:crypto';
import { BillingEventUnattributedException } from '@heryjs/core/drivers';
import { StripeBillingDriver } from './stripe-billing.driver';

const SECRET = 'whsec_isolation_secret';

function signed(metadata: Record<string, string>): [Buffer, string] {
  const body = JSON.stringify({
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: `sub_${metadata.tenantId ?? 'none'}`,
        status: 'active',
        current_period_end: 1_700_000_000,
        metadata,
      },
    },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', SECRET)
    .update(String(timestamp))
    .update('.')
    .update(body)
    .digest('hex');

  return [Buffer.from(body), `t=${timestamp},v1=${signature}`];
}

describe('tenant isolation', () => {
  const driver = new StripeBillingDriver();

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it('attributes each event to the tenant its own subscription names, never the previous one', () => {
    const [eventA] = driver.parseWebhook(
      ...signed({ tenantId: 'tenant-a', plan: 'pro' }),
    );
    const [eventB] = driver.parseWebhook(
      ...signed({ tenantId: 'tenant-b', plan: 'enterprise' }),
    );

    expect(eventA).toMatchObject({ tenantId: 'tenant-a', plan: 'pro' });
    expect(eventB).toMatchObject({ tenantId: 'tenant-b', plan: 'enterprise' });
  });

  it('refuses an event naming no tenant rather than attributing it to the last one seen', () => {
    driver.parseWebhook(...signed({ tenantId: 'tenant-a', plan: 'pro' }));

    expect(() => driver.parseWebhook(...signed({ plan: 'pro' }))).toThrow(
      BillingEventUnattributedException,
    );
  });
});
