import { Injectable } from '@nestjs/common';
import { getAuthContext } from './better-auth.instance';
import { InvalidCredentialsException } from '../errors/invalid-credentials.exception';
import { AuthenticatedUser, AuthProvider } from './auth.types';

@Injectable()
export class SessionAuthProvider implements AuthProvider {
  async register(email: string, password: string): Promise<AuthenticatedUser> {
    const { auth } = await getAuthContext();
    const result = await auth.api.signUpEmail({
      body: { email, password, name: email },
    });
    return { id: result.user.id, email: result.user.email };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: AuthenticatedUser; token: string }> {
    const { auth, APIError } = await getAuthContext();

    try {
      const result = await auth.api.signInEmail({ body: { email, password } });
      return {
        user: { id: result.user.id, email: result.user.email },
        token: result.token,
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw new InvalidCredentialsException();
      }
      throw error;
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

    return { id: session.user.id, email: session.user.email };
  }
}
