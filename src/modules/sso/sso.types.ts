export const SSO_REDIRECT_URI = Symbol('SSO_REDIRECT_URI');

export type SsoLinkPolicy = 'refuse' | 'link-verified';

export const SSO_LINK_POLICIES: readonly SsoLinkPolicy[] = [
  'refuse',
  'link-verified',
];

export const DEFAULT_SSO_LINK_POLICY: SsoLinkPolicy = 'refuse';

export interface SsoDomainRecord {
  id: string;
  domain: string;
  verificationToken: string;
  verifiedAt: Date | null;
}

export interface SsoConnectionRecord {
  id: string;
  tenantId: string;
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  linkPolicy: SsoLinkPolicy;
  isEnabled: boolean;
  createdAt: Date;
  domains: SsoDomainRecord[];
}

export interface SsoConnectionInput {
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  linkPolicy: SsoLinkPolicy;
  domains: string[];
}

export interface SsoDiscoveryDocument {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
}

export interface SsoProfile {
  subject: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export type SsoOutcome = 'signed-in' | 'signed-up' | 'linked';

export interface SsoLoginResult {
  outcome: SsoOutcome;
  userId: string;
  tenantId: string;
  connectionId: string;
  returnTo: string | null;
}
