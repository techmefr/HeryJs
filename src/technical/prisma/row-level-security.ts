import type { Prisma, PrismaClient } from '@prisma/client';
import type { HeryConfig } from '../config/hery-config.types';

export const ROW_LEVEL_SECURITY_DISABLED_WARNING =
  'Row-level security is disabled by database.rowLevelSecurity: false in hery.config.ts. Tenant isolation now rests on the Prisma extension alone; a raw query or a missed code path can read every tenant.';

export function rowLevelSecurityEnabled(config: HeryConfig): boolean {
  return config.database?.rowLevelSecurity !== false;
}

export function warnWhenRowLevelSecurityDisabled(
  config: HeryConfig,
  warn: (message: string) => void,
): boolean {
  const enabled = rowLevelSecurityEnabled(config);

  if (!enabled) {
    warn(ROW_LEVEL_SECURITY_DISABLED_WARNING);
  }

  return enabled;
}

/**
 * For a client outside the tenant-scoped extension (better-auth's, a seeder's)
 * that has to touch a table under a row-level policy: the setting only lives
 * as long as the transaction, so the work runs inside it.
 */
export function inTenantTransaction<T>(
  client: PrismaClient,
  tenantId: string,
  work: (transaction: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number },
): Promise<T> {
  return client.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

    return work(transaction);
  }, options);
}
