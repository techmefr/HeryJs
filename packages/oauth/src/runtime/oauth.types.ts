export type OAuthLinkPolicy = 'refuse' | 'link-authenticated' | 'link-verified';

export const OAUTH_LINK_POLICIES: readonly OAuthLinkPolicy[] = [
  'refuse',
  'link-authenticated',
  'link-verified',
];

export interface OAuthProfile {
  providerUserId: string;
  email: string | null;
  isEmailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

export interface OAuthAuthorizationRequest {
  state: string;
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface OAuthCodeExchange {
  code: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
}

export interface OAuthProvider {
  readonly name: string;
  authorizationUrl(request: OAuthAuthorizationRequest): string;
  fetchProfile(exchange: OAuthCodeExchange): Promise<OAuthProfile>;
}

export type OAuthOutcome = 'signed-in' | 'signed-up' | 'linked';

export interface OAuthLoginResult {
  outcome: OAuthOutcome;
  userId: string;
  provider: string;
  returnTo: string | null;
}

export interface OAuthProviderCredentials {
  clientId: string;
  clientSecret: string;
}

export interface OAuthConfig {
  linkPolicy: OAuthLinkPolicy;
  isSignUpAllowed: boolean;
  redirectBaseUrl: string | null;
  stateSecret: string;
  isProduction: boolean;
  credentials: Record<string, OAuthProviderCredentials>;
  microsoftTenant: string;
}

export const OAUTH_CONFIG = Symbol('OAUTH_CONFIG');
