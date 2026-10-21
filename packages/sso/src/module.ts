import type { ModuleDefinition } from 'heryjs';

const SSO_MODELS = `
model SsoConnection {
  id           String   @id @default(cuid())
  tenantId     String
  name         String
  issuer       String
  clientId     String
  clientSecret String
  linkPolicy   String   @default("refuse")
  isEnabled    Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  domains    SsoDomain[]
  identities SsoIdentity[]

  @@index([tenantId])
}

model SsoDomain {
  id                String    @id @default(cuid())
  tenantId          String
  connectionId      String
  domain            String
  verificationToken String
  verifiedAt        DateTime?
  createdAt         DateTime  @default(now())

  connection SsoConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  @@unique([connectionId, domain])
  @@index([tenantId])
  @@index([domain])
}

model SsoIdentity {
  id           String   @id @default(cuid())
  tenantId     String
  connectionId String
  subject      String
  userId       String
  createdAt    DateTime @default(now())

  connection SsoConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  @@unique([connectionId, subject])
  @@index([tenantId])
  @@index([userId])
}
`;

export default {
  name: 'sso',
  description:
    'Enterprise SSO per tenant over OpenID Connect: a tenant owns its identity provider, proves the email domains it claims with a DNS record, and its users are provisioned just in time with a declared account-linking policy.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();
    context.addPrismaModels(SSO_MODELS);

    context.nextSteps([
      'Run "pnpm hery migrate --name add_sso"',
      'Add CREATE UNIQUE INDEX "SsoDomain_verified_domain_key" ON "SsoDomain"("domain") WHERE "verifiedAt" IS NOT NULL to that migration: it makes "one verified domain, one tenant" hold under concurrent verification',
      'Import "SsoModule.forRoot()" into src/app.module.ts',
      'Set SSO_STATE_SECRET and SSO_SECRET_KEY (openssl rand -base64 32) in production -- the development defaults refuse to run there',
      'Set SSO_REDIRECT_BASE_URL to your public origin and register "<origin>/sso/callback" at each identity provider',
      'A tenant admin creates a connection with POST /sso/connections, publishes the returned TXT record, then calls POST /sso/connections/:id/domains/:domain/verify',
      'Users start with GET /sso/start?email=<address>: the email domain picks the tenant identity provider',
      'Pass a loginHandler to SsoModule.forRoot({ loginHandler }) to replace the default, which mints a Better Auth session and returns its bearer token next to the login result',
    ]);
  },
} satisfies ModuleDefinition;
