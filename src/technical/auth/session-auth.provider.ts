import { Injectable } from '@nestjs/common';
import { authPrismaClient, getAuthContext } from './better-auth.instance';
import { ApiKeyService } from './api-key.service';
import { InvalidCredentialsException } from '#technical/errors/invalid-credentials.exception';
import { AuthenticatedUser, AuthProvider } from './auth.types';

/**
 * Resolves everything the request pipeline is allowed to trust about a caller,
 * from the database rather than from anything the client sent. The tenant is a
 * boundary and the team memberships are a perimeter, so both are read here and
 * nowhere else.
 */
async function authenticate(
  user: { id: string; email: string },
  impersonatedBy: string | null = null,
): Promise<AuthenticatedUser> {
  const stored = await authPrismaClient.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      tenantId: true,
      currentTeamId: true,
      role: true,
      memberships: { select: { teamId: true } },
    },
  });

  const teamIds = stored.memberships.map((membership) => membership.teamId);

  return {
    id: user.id,
    email: user.email,
    tenantId: stored.tenantId,
    teamIds,
    // A current team the caller has since been removed from must not keep
    // granting anything, and a member who never picked one still acts inside a
    // team, so the stored value is only honoured while the membership holds.
    currentTeamId:
      stored.currentTeamId && teamIds.includes(stored.currentTeamId)
        ? stored.currentTeamId
        : (teamIds[0] ?? null),
    role: stored.role,
    impersonatedBy,
  };
}

@Injectable()
export class SessionAuthProvider implements AuthProvider {
  constructor(private readonly apiKeys: ApiKeyService) {}

  async register(email: string, password: string): Promise<AuthenticatedUser> {
    const { auth } = await getAuthContext();
    const result = await auth.api.signUpEmail({
      body: { email, password, name: email },
    });
    return await authenticate(result.user);
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: AuthenticatedUser; token: string }> {
    const { auth, APIError } = await getAuthContext();

    try {
      const result = await auth.api.signInEmail({ body: { email, password } });
      return { user: await authenticate(result.user), token: result.token };
    } catch (error) {
      if (error instanceof APIError) {
        throw new InvalidCredentialsException();
      }
      throw error;
    }
  }

  async devToken(): Promise<{ user: AuthenticatedUser; token: string }> {
    const email = 'dev@heryjs.local';
    const password = 'dev-token-password';

    try {
      return await this.login(email, password);
    } catch {
      await this.register(email, password);
      return await this.login(email, password);
    }
  }

  async validateSession(token: string): Promise<AuthenticatedUser | null> {
    const { auth } = await getAuthContext();
    const session = await auth.api.getSession({
      headers: new Headers({ authorization: `Bearer ${token}` }),
    });

    if (!session) {
      return null;
    }

    const impersonatedBy =
      'impersonatedBy' in session.session
        ? ((session.session.impersonatedBy as string | null) ?? null)
        : null;

    return await authenticate(session.user, impersonatedBy);
  }

  async validateApiKey(token: string): Promise<AuthenticatedUser | null> {
    const identity = await this.apiKeys.validate(token);
    return identity ? await authenticate(identity) : null;
  }
}
