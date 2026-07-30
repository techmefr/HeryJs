export interface AuthenticatedUser {
  id: string;
  email: string;
  tenantId: string;
  teamIds: string[];
  currentTeamId: string | null;
}

export interface AuthProvider {
  register(email: string, password: string): Promise<AuthenticatedUser>;
  login(
    email: string,
    password: string,
  ): Promise<{ user: AuthenticatedUser; token: string }>;
  validateSession(token: string): Promise<AuthenticatedUser | null>;
  devToken(): Promise<{ user: AuthenticatedUser; token: string }>;
}

export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');
