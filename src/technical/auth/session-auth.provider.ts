import { Injectable } from '@nestjs/common';
import { authPrismaClient, getAuthContext } from './better-auth.instance';
import { InvalidCredentialsException } from '../errors/invalid-credentials.exception';
import { AuthenticatedUser, AuthProvider } from './auth.types';

async function loadTenantId(userId: string): Promise<string> {
  const user = await authPrismaClient.user.findUniqueOrThrow({
    where: { id: userId },
    select: { tenantId: true },
  });
  return user.tenantId;
}

@Injectable()
export class SessionAuthProvider implements AuthProvider {
  async register(email: string, password: string): Promise<AuthenticatedUser> {
    const { auth } = await getAuthContext();
    const result = await auth.api.signUpEmail({
      body: { email, password, name: email },
    });
    const tenantId = await loadTenantId(result.user.id);
    return { id: result.user.id, email: result.user.email, tenantId };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: AuthenticatedUser; token: string }> {
    const { auth, APIError } = await getAuthContext();

    try {
      const result = await auth.api.signInEmail({ body: { email, password } });
      const tenantId = await loadTenantId(result.user.id);
      return {
        user: { id: result.user.id, email: result.user.email, tenantId },
        token: result.token,
      };
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

    const tenantId = await loadTenantId(session.user.id);
    return { id: session.user.id, email: session.user.email, tenantId };
  }
}
