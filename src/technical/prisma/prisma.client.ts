import { PrismaClient } from '@prisma/client';
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
  const client = new PrismaClient();

  return client.$extends({
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

          return query(args);
        },
      },
    },
  });
}

export type TenantScopedPrismaClient = ReturnType<
  typeof createTenantScopedPrismaClient
>;

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');
