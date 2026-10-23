import type { ModuleDefinition } from 'heryjs';

const SCIM_MODELS = `
/// @hery.appEnforcedTenant Looked up by the hash of the bearer token a directory sends, which is how the tenant is learned in the first place: there is no ambient tenant to scope the lookup by, and each row carries the one it belongs to.
model ScimToken {
  id         String    @id @default(cuid())
  tenantId   String    @unique
  tokenHash  String    @unique
  prefix     String
  createdAt  DateTime  @default(now())
  rotatedAt  DateTime?
  lastUsedAt DateTime?
}

/// @hery.tenantScoped
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
      'Run "pnpm hery migrate --name add_scim": ScimIdentity is annotated @hery.tenantScoped, so the same run emits its row-level security policy',
      'Import "ScimModule" into src/app.module.ts',
      'A tenant admin issues the tenant token with POST /scim/token (shown once; calling it again rotates it) and gives the identity provider the base URL "<origin>/scim/v2" with that token as a bearer token',
      'GET /scim/token shows whether a token is set and when it was last used, and GET /scim/activity lists what the directory created, updated and deactivated: both appear in the admin panel on their own',
      'Set the proxy trust of your HTTP server so the "location" URLs the module returns use your public origin',
    ]);
  },
} satisfies ModuleDefinition;
