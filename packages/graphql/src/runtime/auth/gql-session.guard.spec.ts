import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser, AuthProvider } from '#kernel/auth/auth.types';
import {
  InvalidSessionException,
  MissingSessionException,
} from '#kernel/errors/invalid-session.exception';
import { GqlSessionGuard } from './gql-session.guard';
import type { GqlRequestWithUser } from './gql-session.guard';

const CALLER: AuthenticatedUser = {
  id: 'user-1',
  email: 'caller@example.com',
  tenantId: 'default',
  teamIds: [],
  currentTeamId: null,
  role: null,
  impersonatedBy: null,
};

/**
 * GqlExecutionContext reads the GraphQL context out of the third argument, so
 * that is the shape a guard sees under Apollo -- not the http request the REST
 * guard is handed.
 */
function contextWith(authorization?: string): {
  context: ExecutionContext;
  request: Request;
} {
  const request = {
    header: (name: string) =>
      name.toLowerCase() === 'authorization' ? authorization : undefined,
  } as unknown as Request;

  const args = [undefined, {}, { req: request }, undefined];

  return {
    request,
    context: {
      getType: () => 'graphql',
      getArgs: () => args,
      getArgByIndex: (index: number) => args[index],
      getClass: () => class Resolver {},
      getHandler: () => function resolve() {},
    } as unknown as ExecutionContext,
  };
}

function guardResolving(
  user: AuthenticatedUser | null,
): [GqlSessionGuard, jest.Mock] {
  const validateSession = jest.fn().mockResolvedValue(user);

  return [
    new GqlSessionGuard({ validateSession } as unknown as AuthProvider),
    validateSession,
  ];
}

describe('the GraphQL session guard', () => {
  it('puts the resolved caller on the request', async () => {
    const [guard] = guardResolving(CALLER);
    const { context, request } = contextWith('Bearer a-valid-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request as GqlRequestWithUser).user).toEqual(CALLER);
  });

  it('refuses a request carrying no Authorization header', async () => {
    const [guard, validateSession] = guardResolving(CALLER);

    await expect(
      guard.canActivate(contextWith(undefined).context),
    ).rejects.toThrow(MissingSessionException);
    expect(validateSession).not.toHaveBeenCalled();
  });

  // Anything that is not a bearer token is the same case as none at all: the
  // scheme is the only one this app accepts, so a Basic header must not fall
  // through to the provider as if it were a token.
  it.each(['a-valid-token', 'Basic dXNlcjpwYXNz', 'bearer lowercase', ''])(
    'refuses the Authorization header %p',
    async (header) => {
      const [guard, validateSession] = guardResolving(CALLER);

      await expect(
        guard.canActivate(contextWith(header).context),
      ).rejects.toThrow(MissingSessionException);
      expect(validateSession).not.toHaveBeenCalled();
    },
  );

  it('refuses a token the provider does not resolve', async () => {
    const [guard] = guardResolving(null);

    await expect(
      guard.canActivate(contextWith('Bearer a-stale-token').context),
    ).rejects.toThrow(InvalidSessionException);
  });

  it('passes the token through without the scheme', async () => {
    const [guard, validateSession] = guardResolving(CALLER);

    await guard.canActivate(contextWith('Bearer a-valid-token').context);

    expect(validateSession).toHaveBeenCalledWith('a-valid-token');
  });
});
