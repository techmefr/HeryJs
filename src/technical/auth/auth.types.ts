export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthProvider {
  register(email: string, password: string): Promise<AuthenticatedUser>;
  login(
    email: string,
    password: string,
  ): Promise<{ user: AuthenticatedUser; token: string }>;
  validateSession(token: string): Promise<AuthenticatedUser | null>;
}

export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');
