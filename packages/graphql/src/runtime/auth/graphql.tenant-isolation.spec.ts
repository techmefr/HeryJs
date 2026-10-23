import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser, AuthProvider } from '#kernel/public/auth';
import { GqlSessionGuard } from './gql-session.guard';
import type { GqlRequestWithUser } from './gql-session.guard';

function callerOf(tenantId: string, id: string): AuthenticatedUser {
  return {
    id,
    email: `${id}@example.com`,
    tenantId,
    teamIds: [],
    currentTeamId: null,
    role: null,
    impersonatedBy: null,
  };
}

const ALICE = callerOf('tenant-a', 'alice');
const BOB = callerOf('tenant-b', 'bob');

function gqlContext(request: Request): ExecutionContext {
  const args = [undefined, {}, { req: request }, undefined];

  return {
    getType: () => 'graphql',
    getArgs: () => args,
    getArgByIndex: (index: number) => args[index],
    getClass: () => class Resolver {},
    getHandler: () => function resolve() {},
  } as unknown as ExecutionContext;
}

function requestWith(headers: Record<string, string>): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function guardFor(callers: Record<string, AuthenticatedUser>): GqlSessionGuard {
  return new GqlSessionGuard({
    validateSession: jest.fn((token: string) =>
      Promise.resolve(callers[token] ?? null),
    ),
  } as unknown as AuthProvider);
}

describe('tenant isolation', () => {
  it('takes the tenant from the session, never from a client header naming another tenant', async () => {
    const guard = guardFor({ 'token-a': ALICE });
    const request = requestWith({
      authorization: 'Bearer token-a',
      'x-tenant-id': 'tenant-b',
    });

    await guard.canActivate(gqlContext(request));

    expect((request as GqlRequestWithUser).user.tenantId).toBe('tenant-a');
  });

  it('never hands the caller resolved for tenant A to a token of tenant B on the same request', async () => {
    const guard = guardFor({ 'token-a': ALICE, 'token-b': BOB });
    const headers: Record<string, string> = {
      authorization: 'Bearer token-a',
    };
    const request = requestWith(headers);

    await guard.canActivate(gqlContext(request));
    headers.authorization = 'Bearer token-b';
    await guard.canActivate(gqlContext(request));

    expect((request as GqlRequestWithUser).user).toEqual(BOB);
  });
});
