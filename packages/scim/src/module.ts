import type { ModuleDefinition } from 'heryjs';

const SCIM_MODELS = `
model ScimToken {
  id         String    @id @default(cuid())
  tenantId   String    @unique
  tokenHash  String    @unique
  prefix     String
  createdAt  DateTime  @default(now())
  rotatedAt  DateTime?
  lastUsedAt DateTime?
}

model ScimIdentity {
  id         String   @id @default(cuid())
  tenantId   String
  kind       String
  resourceId String
  externalId String?
  givenName  String?
  familyName String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([tenantId, kind, resourceId])
  @@unique([tenantId, kind, externalId])
  @@index([tenantId])
}
`;

export default {
  name: 'scim',
  description:
    'SCIM 2.0 provisioning per tenant: an identity provider creates, updates and deactivates the tenant members (users) and teams (groups), authenticated by a per-tenant bearer token and audited in the tenant hash chain.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();
    context.addPrismaModels(SCIM_MODELS);

    context.nextSteps([
      'Run "pnpm hery migrate --name add_scim"',
      'Add "ScimIdentity" to TENANT_SCOPED_MODELS in src/technical/prisma/prisma.client.ts and enable row-level security on it in that migration (ENABLE and FORCE ROW LEVEL SECURITY plus a tenant_isolation policy on "tenantId" = current_setting(\'app.tenant_id\', true))',
      'Import "ScimModule" into src/app.module.ts',
      'A tenant admin issues the tenant token with POST /scim/token (shown once; calling it again rotates it) and gives the identity provider the base URL "<origin>/scim/v2" with that token as a bearer token',
      'GET /scim/token shows whether a token is set and when it was last used, and GET /scim/activity lists what the directory created, updated and deactivated: both appear in the admin panel on their own',
      'Set the proxy trust of your HTTP server so the "location" URLs the module returns use your public origin',
    ]);
  },
} satisfies ModuleDefinition;
