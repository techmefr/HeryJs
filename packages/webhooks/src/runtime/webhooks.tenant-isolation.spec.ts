import { randomUUID } from 'node:crypto';
import { authPrismaClient } from '#kernel/auth/better-auth.instance';
import { SecretsService } from '#kernel/secrets/secrets.service';
import { WebhookNotFoundException } from './webhook-not-found.exception';
import { WebhookSecretService } from './webhook-secret.service';
import { WebhookSubscriptionService } from './webhook-subscription.service';

describe('tenant isolation', () => {
  const tenantA = `tenant-a-${randomUUID()}`;
  const tenantB = `tenant-b-${randomUUID()}`;
  const service = new WebhookSubscriptionService(
    new WebhookSecretService(new SecretsService()),
    () => Promise.resolve(['93.184.216.34']),
  );
  let ownedByB: string;

  beforeAll(async () => {
    ownedByB = (
      await service.create(tenantB, {
        url: 'https://b.example.com/hook',
        events: ['order.created'],
      })
    ).id;
    await service.create(tenantA, {
      url: 'https://a.example.com/hook',
      events: ['order.created'],
    });
  });

  afterAll(async () => {
    await authPrismaClient.webhookSubscription.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
  });

  it('lists only the subscriptions of the calling tenant', async () => {
    const listed = await service.list(tenantA);

    expect(listed).toHaveLength(1);
    expect(listed.map((row) => row.id)).not.toContain(ownedByB);
  });

  it('cannot read a subscription of another tenant by its id', async () => {
    await expect(service.get(tenantA, ownedByB)).rejects.toBeInstanceOf(
      WebhookNotFoundException,
    );
  });

  it('cannot update, rotate or delete a subscription of another tenant', async () => {
    const before = await authPrismaClient.webhookSubscription.findUniqueOrThrow(
      { where: { id: ownedByB } },
    );

    await expect(
      service.update(tenantA, ownedByB, { url: 'https://evil.example.com' }),
    ).rejects.toBeInstanceOf(WebhookNotFoundException);
    await expect(
      service.rotate(tenantA, ownedByB, { graceSeconds: 0 }),
    ).rejects.toBeInstanceOf(WebhookNotFoundException);
    await expect(service.remove(tenantA, ownedByB)).rejects.toBeInstanceOf(
      WebhookNotFoundException,
    );

    const after = await authPrismaClient.webhookSubscription.findUniqueOrThrow({
      where: { id: ownedByB },
    });

    expect(after.url).toBe(before.url);
    expect(after.secret).toBe(before.secret);
  });
});
