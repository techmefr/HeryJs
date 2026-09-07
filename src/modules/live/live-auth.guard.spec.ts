import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import type {
  AuthenticatedUser,
  AuthProvider,
} from '#technical/auth/auth.types';
import { authenticateLiveSocket } from './live-auth.guard';
import type { LiveSocket } from './live-auth.guard';
import { withTenant } from './with-tenant';

const USER: AuthenticatedUser = {
  id: 'user-1',
  email: 'caller@example.com',
  tenantId: 'tenant-1',
  teamIds: [],
  currentTeamId: null,
  role: 'admin',
  impersonatedBy: null,
};

function socketWith(auth: Record<string, unknown>, user?: AuthenticatedUser) {
  return {
    handshake: { auth },
    data: user ? { user } : {},
  } as unknown as LiveSocket;
}

function providerAccepting(expected: string): AuthProvider {
  return {
    validateSession: (token: string) =>
      Promise.resolve(token === expected ? USER : null),
  } as unknown as AuthProvider;
}

describe('live socket authentication', () => {
  it('accepts a socket carrying a valid token and remembers the caller on it', async () => {
    const client = socketWith({ token: 'good' });

    await expect(
      authenticateLiveSocket(client, providerAccepting('good')),
    ).resolves.toBe(true);
    expect(client.data.user).toBe(USER);
  });

  it('refuses a socket with no token at all', async () => {
    await expect(
      authenticateLiveSocket(socketWith({}), providerAccepting('good')),
    ).resolves.toBe(false);
  });

  it('refuses a token the auth provider does not recognise', async () => {
    const client = socketWith({ token: 'forged' });

    await expect(
      authenticateLiveSocket(client, providerAccepting('good')),
    ).resolves.toBe(false);
    expect(client.data.user).toBeUndefined();
  });

  // The session is validated once per connection, not once per message: a
  // socket that already carries a resolved caller must not send the provider
  // another round trip on every frame.
  it('does not revalidate a socket that already carries a caller', async () => {
    const validateSession = jest.fn();
    const client = socketWith({ token: 'good' }, USER);

    await expect(
      authenticateLiveSocket(client, {
        validateSession,
      } as unknown as AuthProvider),
    ).resolves.toBe(true);
    expect(validateSession).not.toHaveBeenCalled();
  });
});

describe('live tenant context', () => {
  it('derives the tenant from the caller resolved at connection time', async () => {
    const seen = await withTenant(socketWith({}, USER), () =>
      Promise.resolve(TenantContextStorage.getTenantId()),
    );

    expect(seen).toBe('tenant-1');
  });

  // A websocket frame is client-controlled input. Whatever tenantId it claims,
  // the context has to come from the socket's own authenticated user --
  // otherwise one message could read another tenant's rows.
  it('ignores a tenantId the client puts in the handshake', async () => {
    const client = socketWith({ tenantId: 'tenant-2' }, USER);

    const seen = await withTenant(client, () =>
      Promise.resolve(TenantContextStorage.getTenantId()),
    );

    expect(seen).toBe('tenant-1');
  });
});
