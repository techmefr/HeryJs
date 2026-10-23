import { isLocalEnvironmentNow } from '#technical/public/config';
import { env } from '#technical/public/env';
import { ssoEnv } from './sso.env';

const CALLBACK_PATH = '/sso/callback';

export function ssoRedirectUri(): string {
  const configured = ssoEnv.SSO_REDIRECT_BASE_URL;

  if (!configured && !isLocalEnvironmentNow()) {
    throw new Error(
      'SSO_REDIRECT_BASE_URL must be set in production for the sso module.',
    );
  }

  const base = configured ?? `http://localhost:${env.PORT}`;

  return `${base.replace(/\/+$/, '')}${CALLBACK_PATH}`;
}
