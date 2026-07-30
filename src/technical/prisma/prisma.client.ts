import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  AUDITED_MODELS,
  AUDITED_OPERATIONS,
  writeAuditLog,
} from '../audit/audit-log';
import { env } from '../config/env';
import { TenantContextStorage } from '../tenancy/tenant-context';

const TENANT_SCOPED_MODELS = new Set(['Workout']);

const TENANT_FILTERED_OPERATIONS = new Set([
  'findFirst',
  'findMany',
  'findUnique',
  'count',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

export function createTenantScopedPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const rawClient = new PrismaClient({ adapter });

  const tenantScopedClient = rawClient.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const tenantId = TenantContextStorage.getTenantId();
          const scopedArgs = args as {
            data?: Record<string, unknown> | Record<string, unknown>[];
            where?: Record<string, unknown>;
          };

          if (operation === 'create') {
            scopedArgs.data = {
              ...(scopedArgs.data as Record<string, unknown>),
              tenantId,
            };
          } else if (
            operation === 'createMany' &&
            Array.isArray(scopedArgs.data)
          ) {
            scopedArgs.data = scopedArgs.data.map((entry) => ({
              ...entry,
              tenantId,
            }));
          } else if (TENANT_FILTERED_OPERATIONS.has(operation)) {
            scopedArgs.where = { ...scopedArgs.where, tenantId };
          }

          if (!env.RLS_ENABLED) {
            return query(args);
          }

          // Row-level security relies on a session-local setting, which only
          // survives for the lifetime of a single transaction (this also
          // holds under pgBouncer's transaction pooling mode, since the
          // whole block below runs on one pooled connection). Every
          // tenant-scoped operation is wrapped so the setting and the query
          // it protects always travel together.
          const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
          return rawClient.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
            const delegates = tx as unknown as Record<
              string,
              Record<string, (opArgs: unknown) => unknown>
            >;
            const run = delegates[delegateName]?.[operation];
            if (!run) {
              throw new Error(
                `No Prisma delegate for model "${model}" operation "${operation}"`,
              );
            }
            return run(args);
          });
        },
      },
    },
  });

  return tenantScopedClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);

          if (AUDITED_MODELS.has(model) && AUDITED_OPERATIONS.has(operation)) {
            const record = result as { id?: string } | null;

            await writeAuditLog(rawClient, {
              tenantId: TenantContextStorage.getTenantId(),
              model,
              operation,
              recordId: record?.id ?? null,
              data: result,
            });
          }

          return result;
        },
      },
    },
  });
}

export type TenantScopedPrismaClient = ReturnType<
  typeof createTenantScopedPrismaClient
>;

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');
