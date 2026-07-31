export interface AuthenticatedUser {
  id: string;
  email: string;
  tenantId: string;
  teamIds: string[];
  currentTeamId: string | null;
  role: string | null;
  // Set only while the caller is inside an impersonation session, to the id
  // of the admin who started it. Never trust it from anywhere but the
  // session row itself -- see TenantMiddleware's own comment on why nothing
  // client-supplied is trusted for identity.
  impersonatedBy: string | null;
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
