export const SSO_IDENTITY_STORE = Symbol('SSO_IDENTITY_STORE');

export interface SsoLocalUser {
  id: string;
  tenantId: string;
  email: string;
  isEmailVerified: boolean;
  isBanned: boolean;
}

export interface SsoNewUser {
  tenantId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface SsoIdentityStore {
  findLinkedUserId(
    connectionId: string,
    subject: string,
  ): Promise<string | null>;
  findUser(id: string): Promise<SsoLocalUser | null>;
  findUserByEmail(email: string): Promise<SsoLocalUser | null>;
  createUser(user: SsoNewUser): Promise<SsoLocalUser | null>;
  linkIdentity(
    tenantId: string,
    connectionId: string,
    subject: string,
    userId: string,
  ): Promise<boolean>;
  removeIdentity(connectionId: string, subject: string): Promise<void>;
}
