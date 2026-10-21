import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import type {
  RateLimitHit,
  RateLimitStore,
} from '#technical/rate-limit/rate-limit-store';
import { AuthRecipientThrottle, recipientOf } from './auth-recipient-throttle';

function fakeStore(
  hit: (key: string, limit: number) => Promise<RateLimitHit>,
): RateLimitStore {
  return { hit } as unknown as RateLimitStore;
}

function countingStore(): { store: RateLimitStore; keys: string[] } {
  const keys: string[] = [];
  let count = 0;

  const store = fakeStore((key, limit) => {
    keys.push(key);
    count += 1;

    return Promise.resolve({
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: 42,
    });
  });

  return { store, keys };
}

describe('recipientOf', () => {
  it('reads the email of the routes that send a link or a code to one', () => {
    expect(recipientOf('/sign-in/magic-link', { email: ' A@B.test ' })).toBe(
      'a@b.test',
    );
    expect(
      recipientOf('/email-otp/send-verification-otp', { email: 'a@b.test' }),
    ).toBe('a@b.test');
  });

  it('reads the phone number of the routes that text a code', () => {
    expect(
      recipientOf('/phone-number/send-otp', { phoneNumber: '+33612345678' }),
    ).toBe('+33612345678');
  });

  it('ignores routes that send nothing and bodies without a recipient', () => {
    expect(recipientOf('/sign-in/email', { email: 'a@b.test' })).toBeNull();
    expect(recipientOf('/sign-in/magic-link', {})).toBeNull();
    expect(recipientOf('/sign-in/magic-link', null)).toBeNull();
    expect(recipientOf('/sign-in/magic-link', { email: '   ' })).toBeNull();
    expect(recipientOf('/sign-in/magic-link', { email: 42 })).toBeNull();
  });
});

describe('AuthRecipientThrottle', () => {
  const inTenant = <T>(tenantId: string, run: () => T): T =>
    TenantContextStorage.run({ tenantId }, run);

  it('lets a recipient through up to the bucket and then answers 429', async () => {
    const throttle = new AuthRecipientThrottle(countingStore().store);

    await inTenant('t1', async () => {
      await throttle.hit('a@b.test');
      await throttle.hit('a@b.test');
      await throttle.hit('a@b.test');

      await expect(throttle.hit('a@b.test')).rejects.toMatchObject({
        status: 429,
      });
    });
  });

  it('keys the counter by tenant so two tenants never share a recipient budget', async () => {
    const { store, keys } = countingStore();
    const throttle = new AuthRecipientThrottle(store);

    await inTenant('t1', () => throttle.hit('a@b.test'));
    await inTenant('t2', () => throttle.hit('a@b.test'));

    expect(keys).toEqual([
      'auth-recipient:t1:a@b.test',
      'auth-recipient:t2:a@b.test',
    ]);
  });

  it('fails closed with a 503 when the counter store is unreachable', async () => {
    const throttle = new AuthRecipientThrottle(
      fakeStore(() => Promise.reject(new Error('redis is down'))),
    );

    await inTenant('t1', async () => {
      await expect(throttle.hit('a@b.test')).rejects.toMatchObject({
        status: 503,
      });
    });
  });
});
