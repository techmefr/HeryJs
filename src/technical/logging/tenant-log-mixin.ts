import { TenantContextStorage } from '#technical/tenancy/tenant-context';

/**
 * Stamps every line with the tenant it was logged under, read from the same
 * ambient context the Prisma client reads. It is what makes the persisted log
 * tenant-safe: a line logged outside any request carries none, and is stored
 * against `system`, which no caller can query.
 */
export function tenantLogMixin(): { tenantId?: string } {
  const tenantId = TenantContextStorage.findTenantId();

  return tenantId === null ? {} : { tenantId };
}
