import { OAuthAccountService } from './oauth-account.service';
import type {
  OAuthIdentityStore,
  OAuthLocalUser,
  OAuthNewUser,
} from './oauth-identity.store';
import { OAuthRefusedException } from './oauth-refused.exception';
import type { OAuthConfig, OAuthLinkPolicy, OAuthProfile } from './oauth.types';

class InMemoryStore implements OAuthIdentityStore {
  users = new Map<string, OAuthLocalUser>();
  identities = new Map<string, string>();
  private sequence = 0;

  seedUser(
    partial: Partial<OAuthLocalUser> & { email: string },
  ): OAuthLocalUser {
    this.sequence += 1;
    const user: OAuthLocalUser = {
      id: `user-${this.sequence}`,
      isEmailVerified: true,
      isBanned: false,
      ...partial,
    };
    this.users.set(user.id, user);
    return user;
  }

  findLinkedUserId(
    provider: string,
    providerUserId: string,
  ): Promise<string | null> {
    return Promise.resolve(
      this.identities.get(`${provider}:${providerUserId}`) ?? null,
    );
  }

  findUser(id: string): Promise<OAuthLocalUser | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  findUserByEmail(email: string): Promise<OAuthLocalUser | null> {
    const match = [...this.users.values()].find(
      (user) => user.email.toLowerCase() === email.toLowerCase(),
    );
    return Promise.resolve(match ?? null);
  }

  createUser(user: OAuthNewUser): Promise<OAuthLocalUser | null> {
    return Promise.resolve(this.seedUser({ email: user.email.toLowerCase() }));
  }

  linkIdentity(
    provider: string,
    providerUserId: string,
    userId: string,
  ): Promise<boolean> {
    const key = `${provider}:${providerUserId}`;

    if (this.identities.has(key)) {
      return Promise.resolve(false);
    }

    this.identities.set(key, userId);
    return Promise.resolve(true);
  }

  removeIdentity(provider: string, providerUserId: string): Promise<void> {
    this.identities.delete(`${provider}:${providerUserId}`);
    return Promise.resolve();
  }
}

function config(
  linkPolicy: OAuthLinkPolicy,
  isSignUpAllowed = true,
): OAuthConfig {
  return {
    linkPolicy,
    isSignUpAllowed,
    redirectBaseUrl: 'https://app.test',
    stateSecret: 'secret',
    isProduction: false,
    credentials: {},
    microsoftTenant: 'common',
  };
}

function profile(overrides: Partial<OAuthProfile> = {}): OAuthProfile {
  return {
    providerUserId: 'g-1',
    email: 'ada@example.com',
    isEmailVerified: true,
    name: 'Ada',
    avatarUrl: null,
    ...overrides,
  };
}

function reasonOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => 'accepted',
    (error: unknown) =>
      error instanceof OAuthRefusedException ? error.reason : 'other',
  );
}

function request(
  overrides: Partial<{ profile: OAuthProfile; linkUserId: string | null }> = {},
) {
  return {
    provider: 'google',
    profile: overrides.profile ?? profile(),
    linkUserId: overrides.linkUserId ?? null,
    returnTo: null,
  };
}

describe('OAuthAccountService', () => {
  describe('a new email', () => {
    it('signs the user up and links the identity', async () => {
      const store = new InMemoryStore();
      const service = new OAuthAccountService(config('refuse'), store);

      const result = await service.resolve(request());

      expect(result.outcome).toBe('signed-up');
      expect(store.identities.get('google:g-1')).toBe(result.userId);
    });

    it('refuses when sign-up is disabled', async () => {
      const service = new OAuthAccountService(
        config('refuse', false),
        new InMemoryStore(),
      );

      expect(await reasonOf(service.resolve(request()))).toBe(
        'sign-up-disabled',
      );
    });

    it('refuses an unverified provider email', async () => {
      const service = new OAuthAccountService(
        config('link-verified'),
        new InMemoryStore(),
      );

      const unverified = profile({ isEmailVerified: false });

      expect(
        await reasonOf(service.resolve(request({ profile: unverified }))),
      ).toBe('email-unverified');
    });

    it('refuses a profile with no email', async () => {
      const service = new OAuthAccountService(
        config('refuse'),
        new InMemoryStore(),
      );

      expect(
        await reasonOf(
          service.resolve(request({ profile: profile({ email: null }) })),
        ),
      ).toBe('email-missing');
    });
  });

  describe('an email that already belongs to a local account', () => {
    it.each<OAuthLinkPolicy>(['refuse', 'link-authenticated'])(
      'refuses under %s and creates no identity',
      async (policy) => {
        const store = new InMemoryStore();
        store.seedUser({ email: 'Ada@Example.com' });
        const service = new OAuthAccountService(config(policy), store);

        expect(await reasonOf(service.resolve(request()))).toBe(
          'account-exists',
        );
        expect(store.identities.size).toBe(0);
      },
    );

    it('links under link-verified when both emails are verified', async () => {
      const store = new InMemoryStore();
      const local = store.seedUser({ email: 'ada@example.com' });
      const service = new OAuthAccountService(config('link-verified'), store);

      const result = await service.resolve(request());

      expect(result).toMatchObject({ outcome: 'linked', userId: local.id });
    });

    it('still refuses under link-verified when the local email is unverified', async () => {
      const store = new InMemoryStore();
      store.seedUser({ email: 'ada@example.com', isEmailVerified: false });
      const service = new OAuthAccountService(config('link-verified'), store);

      expect(await reasonOf(service.resolve(request()))).toBe('account-exists');
      expect(store.identities.size).toBe(0);
    });

    it('never links the unverified provider email, whatever the policy', async () => {
      const store = new InMemoryStore();
      store.seedUser({ email: 'ada@example.com' });
      const service = new OAuthAccountService(config('link-verified'), store);

      const unverified = profile({ isEmailVerified: false });

      expect(
        await reasonOf(service.resolve(request({ profile: unverified }))),
      ).toBe('email-unverified');
      expect(store.identities.size).toBe(0);
    });

    it('refuses a banned local account even when it would link', async () => {
      const store = new InMemoryStore();
      store.seedUser({ email: 'ada@example.com', isBanned: true });
      const service = new OAuthAccountService(config('link-verified'), store);

      expect(await reasonOf(service.resolve(request()))).toBe('user-banned');
    });
  });

  describe('a known identity', () => {
    it('signs in the linked user even when the provider email has changed', async () => {
      const store = new InMemoryStore();
      const local = store.seedUser({ email: 'ada@example.com' });
      store.identities.set('google:g-1', local.id);
      const service = new OAuthAccountService(config('refuse'), store);

      const changed = profile({ email: 'someone-else@example.com' });
      const result = await service.resolve(request({ profile: changed }));

      expect(result).toMatchObject({ outcome: 'signed-in', userId: local.id });
    });

    it('does not follow an identity whose email matches another account', async () => {
      const store = new InMemoryStore();
      const owner = store.seedUser({ email: 'owner@example.com' });
      store.seedUser({ email: 'victim@example.com' });
      store.identities.set('google:g-1', owner.id);
      const service = new OAuthAccountService(config('link-verified'), store);

      const spoofed = profile({ email: 'victim@example.com' });
      const result = await service.resolve(request({ profile: spoofed }));

      expect(result.userId).toBe(owner.id);
    });

    it('refuses a banned user', async () => {
      const store = new InMemoryStore();
      const local = store.seedUser({
        email: 'ada@example.com',
        isBanned: true,
      });
      store.identities.set('google:g-1', local.id);
      const service = new OAuthAccountService(config('refuse'), store);

      expect(await reasonOf(service.resolve(request()))).toBe('user-banned');
    });

    it('drops an identity whose user was deleted and starts over', async () => {
      const store = new InMemoryStore();
      store.identities.set('google:g-1', 'user-gone');
      const service = new OAuthAccountService(config('refuse'), store);

      const result = await service.resolve(request());

      expect(result.outcome).toBe('signed-up');
      expect(store.identities.get('google:g-1')).toBe(result.userId);
    });
  });

  describe('linking from a signed-in session', () => {
    it('refuses when the policy is refuse', async () => {
      const store = new InMemoryStore();
      const local = store.seedUser({ email: 'ada@example.com' });
      const service = new OAuthAccountService(config('refuse'), store);

      expect(
        await reasonOf(service.resolve(request({ linkUserId: local.id }))),
      ).toBe('linking-disabled');
    });

    it('links a provider identity whose email differs', async () => {
      const store = new InMemoryStore();
      const local = store.seedUser({ email: 'ada@example.com' });
      const service = new OAuthAccountService(
        config('link-authenticated'),
        store,
      );

      const other = profile({
        email: 'ada@work.example',
        isEmailVerified: false,
      });
      const result = await service.resolve(
        request({ profile: other, linkUserId: local.id }),
      );

      expect(result).toMatchObject({ outcome: 'linked', userId: local.id });
    });

    it('refuses an identity already linked to a different user', async () => {
      const store = new InMemoryStore();
      const first = store.seedUser({ email: 'a@example.com' });
      const second = store.seedUser({ email: 'b@example.com' });
      store.identities.set('google:g-1', first.id);
      const service = new OAuthAccountService(
        config('link-authenticated'),
        store,
      );

      expect(
        await reasonOf(service.resolve(request({ linkUserId: second.id }))),
      ).toBe('identity-linked-elsewhere');
    });
  });
});
