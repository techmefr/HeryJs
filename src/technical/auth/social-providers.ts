import type { AuthEnv } from './auth.env';

export interface SocialProviderCredentials {
  clientId: string;
  clientSecret: string;
}

export type SocialProviders = Record<string, SocialProviderCredentials>;

/**
 * A provider is registered only when both halves of its credential pair are
 * present. Passing empty strings through instead would register the provider
 * anyway: Better Auth would mount /sign-in/social for it, the UI would render
 * the button, and the failure would land on a user as a 500 from the callback
 * rather than on the operator as a missing variable.
 *
 * Half a pair is treated as absent rather than fatal for the same reason the
 * kernel tolerates an unset optional: the common case is a .env copied without
 * the secret, and an app that simply has no Google button still boots.
 */
export function buildSocialProviders(env: AuthEnv): SocialProviders {
  const pairs: Record<
    string,
    { clientId: string | undefined; clientSecret: string | undefined }
  > = {
    google: {
      clientId: env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: env.AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
    },
  };

  const configured: SocialProviders = {};

  for (const [name, pair] of Object.entries(pairs)) {
    if (pair.clientId && pair.clientSecret) {
      configured[name] = {
        clientId: pair.clientId,
        clientSecret: pair.clientSecret,
      };
    }
  }

  return configured;
}
