import type { ModuleDefinition } from 'heryjs';

const OAUTH_IDENTITY_MODEL = `
/// @hery.tenantFree A provider identity hanging off a User, which carries the tenant; a sign-in looks it up by provider and provider user id before any session exists, so there is no tenant to scope the lookup by.
model OauthIdentity {
  id             String   @id @default(cuid())
  userId         String
  provider       String
  providerUserId String
  email          String?
  createdAt      DateTime @default(now())

  @@unique([provider, providerUserId])
  @@index([userId])
}
`;

export default {
  name: 'oauth',
  description:
    'Social sign-in over a provider contract (Google, GitHub, Microsoft), with PKCE, a state cookie bound to the browser, verified emails only, and a declared policy for what happens when the provider email already belongs to a local account.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: ['ioredis'],
  install(context) {
    context.copyRuntime();
    context.addPrismaModels(OAUTH_IDENTITY_MODEL);

    context.nextSteps([
      'Run "pnpm hery migrate --name add_oauth_identity"',
      'Set OAUTH_STATE_SECRET in production -- the dev default refuses to run there',
      'Set OAUTH_REDIRECT_BASE_URL to your public origin and register "<origin>/oauth/<provider>/callback" at each provider',
      'Set OAUTH_<PROVIDER>_CLIENT_ID and OAUTH_<PROVIDER>_CLIENT_SECRET (google, github, microsoft) -- a provider missing either half is not registered',
      'Choose OAUTH_LINK_POLICY: "refuse" (default), "link-authenticated" or "link-verified" -- read the guide before loosening it',
      "Declare ['@heryjs/oauth', { loginHandler }] in hery.config.ts to replace the default, which mints a Better Auth session and returns its bearer token next to the login result",
    ]);
  },
} satisfies ModuleDefinition;
