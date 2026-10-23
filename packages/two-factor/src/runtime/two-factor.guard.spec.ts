import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser, RequestWithUser } from '#kernel/public/auth';
import { MissingSessionException } from '#kernel/public/errors';
import { TwoFactorGuard } from './two-factor.guard';
import { TwoFactorRequiredException } from './two-factor-required.exception';
import type { TwoFactorService } from './two-factor.service';

const user: AuthenticatedUser = {
  id: 'user-1',
  email: 'ada@example.test',
  tenantId: 'tenant-1',
  teamIds: [],
  currentTeamId: null,
  role: null,
  impersonatedBy: null,
};

function contextFor(request: Partial<RequestWithUser>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function requestWith(overrides: Partial<RequestWithUser>): RequestWithUser {
  return {
    user,
    credential: 'session',
    header: (name: string) =>
      name === 'authorization' ? 'Bearer token-1' : undefined,
    ...overrides,
  } as unknown as RequestWithUser;
}

function build(assertSatisfied: jest.Mock): TwoFactorGuard {
  return new TwoFactorGuard({ assertSatisfied } as unknown as TwoFactorService);
}

describe('TwoFactorGuard', () => {
  it('asks the service about the caller and the exact token they sent', async () => {
    const assertSatisfied = jest.fn().mockResolvedValue(undefined);

    await expect(
      build(assertSatisfied).canActivate(contextFor(requestWith({}))),
    ).resolves.toBe(true);
    expect(assertSatisfied).toHaveBeenCalledWith(user, 'token-1');
  });

  it('lets the service refuse the request', async () => {
    const assertSatisfied = jest
      .fn()
      .mockRejectedValue(new TwoFactorRequiredException());

    await expect(
      build(assertSatisfied).canActivate(contextFor(requestWith({}))),
    ).rejects.toBeInstanceOf(TwoFactorRequiredException);
  });

  it('is not a substitute for SessionGuard', async () => {
    const assertSatisfied = jest.fn();

    await expect(
      build(assertSatisfied).canActivate(
        contextFor(requestWith({ user: undefined })),
      ),
    ).rejects.toBeInstanceOf(MissingSessionException);
    expect(assertSatisfied).not.toHaveBeenCalled();
  });

  it('does not ask an API key for a second factor', async () => {
    const assertSatisfied = jest.fn();

    await expect(
      build(assertSatisfied).canActivate(
        contextFor(requestWith({ credential: 'apiKey' })),
      ),
    ).resolves.toBe(true);
    expect(assertSatisfied).not.toHaveBeenCalled();
  });

  it('does not ask an impersonation session for the target second factor', async () => {
    const assertSatisfied = jest.fn();
    const impersonated = { ...user, impersonatedBy: 'admin-1' };

    await expect(
      build(assertSatisfied).canActivate(
        contextFor(requestWith({ user: impersonated })),
      ),
    ).resolves.toBe(true);
    expect(assertSatisfied).not.toHaveBeenCalled();
  });
});
