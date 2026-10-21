import { createHmac } from 'node:crypto';
import { env } from '#technical/config/env';
import { ChangeFeedTokenService } from './change-feed-token.service';
import type { ChangeFeedSubscriber } from './change-feed.types';

const subscriber: ChangeFeedSubscriber = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  subject: {
    id: 'user-1',
    teamIds: ['team-1'],
    currentTeamId: 'team-1',
    role: null,
  },
};

function signedWith(body: string, prefix: string): string {
  const signature = createHmac('sha256', env.SSE_TOKEN_SECRET)
    .update(`${prefix}${body}`)
    .digest('base64url');

  return `${body}.${signature}`;
}

describe('ChangeFeedTokenService', () => {
  const tokens = new ChangeFeedTokenService();

  it('round-trips the subscriber it was issued for', () => {
    expect(tokens.verify(tokens.issue(subscriber))).toEqual(subscriber);
  });

  it('refuses a token that was tampered with', () => {
    const [body, signature] = tokens.issue(subscriber).split('.');
    const forged = Buffer.from(
      JSON.stringify({
        subscriber: { ...subscriber, tenantId: 'tenant-2' },
        exp: Date.now() + 60_000,
      }),
    ).toString('base64url');

    expect(tokens.verify(`${forged}.${signature}`)).toBeNull();
    expect(tokens.verify(`${body}.garbage`)).toBeNull();
    expect(tokens.verify('')).toBeNull();
    expect(tokens.verify('nodot')).toBeNull();
  });

  it('refuses an expired token', () => {
    expect(tokens.verify(tokens.issue(subscriber, -1))).toBeNull();
  });

  it('refuses a token signed without the change feed domain, as the sse and signal tokens are', () => {
    const body = Buffer.from(
      JSON.stringify({ subscriber, exp: Date.now() + 60_000 }),
    ).toString('base64url');

    expect(tokens.verify(signedWith(body, ''))).toBeNull();
    expect(tokens.verify(signedWith(body, 'change-feed.'))).toEqual(subscriber);
  });

  it('refuses a validly signed token that carries no subscriber', () => {
    const body = Buffer.from(
      JSON.stringify({ tenantId: 'tenant-1', exp: Date.now() + 60_000 }),
    ).toString('base64url');

    expect(tokens.verify(signedWith(body, 'change-feed.'))).toBeNull();
  });
});
