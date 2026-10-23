import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { loadBlueprint } from '../../../cli/lib/blueprint';
import { buildResourceContext } from '../../../cli/lib/resource-context';
import { prismaModelBlock } from '../../../cli/lib/templates';
import { annotatedModelsIn, registriesFrom } from './model-annotations';
import type { ModelRegistries } from './model-annotations';
import { createTenantScopedPrismaClient } from './prisma.client';
import { readPrismaSchema } from './schema-files';
import type { TenantScopedPrismaClient } from './prisma.client';

const ROOT = path.join(__dirname, '..', '..', '..');
const EXAMPLES = path.join(ROOT, 'examples');
const SCHEMA = readPrismaSchema(ROOT) ?? '';

function registriesOf(source: string, model: string) {
  const registries = registriesFrom(
    annotatedModelsIn(source).filter((entry) => entry.name === model),
  );
  const pick = (name: keyof ModelRegistries) => [...registries[name]].sort();

  return {
    tenantScoped: pick('tenantScoped'),
    appEnforcedTenant: pick('appEnforcedTenant'),
    history: pick('history'),
    encrypted: pick('encrypted'),
  };
}

const blueprints = readdirSync(EXAMPLES)
  .filter((file) => file.endsWith('.yaml'))
  .map((file) => buildResourceContext(loadBlueprint(path.join(EXAMPLES, file))))
  .filter((ctx) => ctx.ownsModel);

describe('a generated resource', () => {
  it.each(blueprints.map((ctx) => [ctx.pascalName, ctx] as const))(
    'declares %s tenant-scoped in the schema it writes',
    (_name, ctx) => {
      const block = prismaModelBlock(ctx);

      expect(registriesOf(block, ctx.pascalName).tenantScoped).toEqual([
        ctx.pascalName,
      ]);
      expect(registriesOf(SCHEMA, ctx.pascalName)).toEqual(
        registriesOf(block, ctx.pascalName),
      );
    },
  );
});

type SnippetInput = Omit<Prisma.SnippetUncheckedCreateInput, 'tenantId'>;

/**
 * Snippet's schema block is what `hery generate` writes for its blueprint (the
 * case above), so this is a generated resource behind the real extension and
 * the real policy: a row written in one tenant is invisible from another.
 */
describe('a generated resource across two tenants (real database)', () => {
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL,
  });
  const rawClient = new PrismaClient({ adapter });
  let scopedClient: TenantScopedPrismaClient;
  let ownerId: string;
  const tenantA = `tenant-a-${randomUUID()}`;
  const tenantB = `tenant-b-${randomUUID()}`;

  beforeAll(async () => {
    await rawClient.$connect();
    scopedClient = createTenantScopedPrismaClient();
    await scopedClient.$connect();
    ownerId = (
      await rawClient.user.create({
        data: { email: `owner-${randomUUID()}@example.test` },
      })
    ).id;
  });

  afterAll(async () => {
    await rawClient.snippet.deleteMany({ where: { ownerId } });
    await rawClient.user.delete({ where: { id: ownerId } });
    await rawClient.$disconnect();
    await scopedClient.$disconnect();
  });

  it('stamps the writing tenant and hides the row from the other one', async () => {
    const created = await TenantContextStorage.run(
      { tenantId: tenantA },
      async () =>
        scopedClient.snippet.create({
          data: {
            title: 'tenant A only',
            ownerId,
          } satisfies SnippetInput as Prisma.SnippetUncheckedCreateInput,
        }),
    );

    expect(created.tenantId).toBe(tenantA);

    const seenByB = await TenantContextStorage.run(
      { tenantId: tenantB },
      async () => ({
        list: await scopedClient.snippet.findMany({ where: { ownerId } }),
        byId: await scopedClient.snippet.findFirst({
          where: { id: created.id },
        }),
        updated: await scopedClient.snippet.updateMany({
          where: { id: created.id },
          data: { title: 'overwritten by B' },
        }),
      }),
    );

    expect(seenByB.list).toEqual([]);
    expect(seenByB.byId).toBeNull();
    expect(seenByB.updated.count).toBe(0);

    const seenByA = await TenantContextStorage.run(
      { tenantId: tenantA },
      async () => scopedClient.snippet.findMany({ where: { ownerId } }),
    );

    expect(seenByA.map((row) => row.title)).toEqual(['tenant A only']);
  });
});
