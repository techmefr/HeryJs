import type { ModuleDefinition } from 'heryjs';

const OAUTH_IDENTITY_MODEL = `
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
      'Import "OAuthModule.forRoot()" into src/app.module.ts',
      'Set OAUTH_STATE_SECRET in production -- the dev default refuses to run there',
      'Set OAUTH_REDIRECT_BASE_URL to your public origin and register "<origin>/oauth/<provider>/callback" at each provider',
      'Set OAUTH_<PROVIDER>_CLIENT_ID and OAUTH_<PROVIDER>_CLIENT_SECRET (google, github, microsoft) -- a provider missing either half is not registered',
      'Choose OAUTH_LINK_POLICY: "refuse" (default), "link-authenticated" or "link-verified" -- read the guide before loosening it',
      'Pass a loginHandler to OAuthModule.forRoot({ loginHandler }) to turn a resolved login into your own session; the default only returns the result as JSON',
    ]);
  },
} satisfies ModuleDefinition;
