import { SsoProvisioningService } from './sso-provisioning.service';
import { connectionRecord, InMemorySsoIdentityStore } from './sso.fakes';
import type { SsoProfile } from './sso.types';

const profile: SsoProfile = {
  subject: 'sub-1',
  email: 'jane@acme.test',
  name: 'Jane',
  avatarUrl: null,
};

function build() {
  const store = new InMemorySsoIdentityStore();

  return { store, service: new SsoProvisioningService(store) };
}

describe('SsoProvisioningService', () => {
  it('creates the user inside the connection tenant on first sign-in', async () => {
    const { store, service } = build();

    const result = await service.resolve(connectionRecord(), profile, '/home');

    expect(result).toMatchObject({
      outcome: 'signed-up',
      tenantId: 'acme',
      returnTo: '/home',
    });
    expect(store.users[0]).toMatchObject({
      email: 'jane@acme.test',
      tenantId: 'acme',
    });
    expect(store.identities).toHaveLength(1);
  });

  it('signs a returning identity in without creating anything', async () => {
    const { store, service } = build();

    await service.resolve(connectionRecord(), profile, null);
    const second = await service.resolve(connectionRecord(), profile, null);

    expect(second.outcome).toBe('signed-in');
    expect(store.users).toHaveLength(1);
    expect(store.identities).toHaveLength(1);
  });

  it('keeps the identity bound to the subject even when the email changes', async () => {
    const { store, service } = build();

    const first = await service.resolve(connectionRecord(), profile, null);
    const renamed = await service.resolve(
      connectionRecord(),
      { ...profile, email: 'jane.doe@acme.test' },
      null,
    );

    expect(renamed.userId).toBe(first.userId);
    expect(store.users).toHaveLength(1);
  });

  it('refuses a same-tenant local account under the refuse policy', async () => {
    const { store, service } = build();

    store.users.push({
      id: 'local',
      tenantId: 'acme',
      email: 'jane@acme.test',
      isEmailVerified: true,
      isBanned: false,
    });

    await expect(
      service.resolve(connectionRecord(), profile, null),
    ).rejects.toMatchObject({
      reason: 'account-exists',
    });
    expect(store.identities).toHaveLength(0);
  });

  it('links a verified same-tenant local account under link-verified', async () => {
    const { store, service } = build();

    store.users.push({
      id: 'local',
      tenantId: 'acme',
      email: 'jane@acme.test',
      isEmailVerified: true,
      isBanned: false,
    });

    const result = await service.resolve(
      connectionRecord({ linkPolicy: 'link-verified' }),
      profile,
      null,
    );

    expect(result).toMatchObject({ outcome: 'linked', userId: 'local' });
  });

  it('does not link an unverified local account even under link-verified', async () => {
    const { store, service } = build();

    store.users.push({
      id: 'local',
      tenantId: 'acme',
      email: 'jane@acme.test',
      isEmailVerified: false,
      isBanned: false,
    });

    await expect(
      service.resolve(
        connectionRecord({ linkPolicy: 'link-verified' }),
        profile,
        null,
      ),
    ).rejects.toMatchObject({ reason: 'account-exists' });
  });

  it('never links across tenants, whatever the policy says', async () => {
    const { store, service } = build();

    store.users.push({
      id: 'other',
      tenantId: 'globex',
      email: 'jane@acme.test',
      isEmailVerified: true,
      isBanned: false,
    });

    await expect(
      service.resolve(
        connectionRecord({ linkPolicy: 'link-verified' }),
        profile,
        null,
      ),
    ).rejects.toMatchObject({ reason: 'account-exists' });
    expect(store.identities).toHaveLength(0);
  });

  it('refuses a banned user on a known identity and on a collision', async () => {
    const { store, service } = build();

    store.users.push({
      id: 'local',
      tenantId: 'acme',
      email: 'jane@acme.test',
      isEmailVerified: true,
      isBanned: true,
    });

    await expect(
      service.resolve(
        connectionRecord({ linkPolicy: 'link-verified' }),
        profile,
        null,
      ),
    ).rejects.toMatchObject({ reason: 'user-banned' });

    store.identities.push({
      connectionId: 'conn-1',
      subject: 'sub-1',
      userId: 'local',
    });

    await expect(
      service.resolve(connectionRecord(), profile, null),
    ).rejects.toMatchObject({
      reason: 'user-banned',
    });
  });

  it('refuses a known identity whose user now lives in another tenant', async () => {
    const { store, service } = build();

    store.users.push({
      id: 'moved',
      tenantId: 'globex',
      email: 'jane@acme.test',
      isEmailVerified: true,
      isBanned: false,
    });
    store.identities.push({
      connectionId: 'conn-1',
      subject: 'sub-1',
      userId: 'moved',
    });

    await expect(
      service.resolve(connectionRecord(), profile, null),
    ).rejects.toMatchObject({
      reason: 'account-exists',
    });
  });

  it('forgets an identity whose user was deleted and provisions again', async () => {
    const { store, service } = build();

    store.identities.push({
      connectionId: 'conn-1',
      subject: 'sub-1',
      userId: 'gone',
    });

    const result = await service.resolve(connectionRecord(), profile, null);

    expect(result.outcome).toBe('signed-up');
    expect(store.identities).toHaveLength(1);
    expect(store.identities[0]?.userId).toBe(result.userId);
  });

  it('keeps two connections apart even for the same subject', async () => {
    const { store, service } = build();

    await service.resolve(connectionRecord(), profile, null);

    await expect(
      service.resolve(
        connectionRecord({ id: 'conn-2', tenantId: 'globex' }),
        profile,
        null,
      ),
    ).rejects.toMatchObject({ reason: 'account-exists' });
    expect(store.identities).toHaveLength(1);
  });
});
