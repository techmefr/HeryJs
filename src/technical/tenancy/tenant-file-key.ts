import { TenantContextStorage } from './tenant-context';

const UNSAFE_SEGMENTS = new Set(['', '.', '..']);

/**
 * A stored key is the tenant's own when its first segment is the tenant id,
 * the prefix every upload writes under, and nothing after it climbs out.
 */
export function isTenantFileKey(key: string, tenantId: string): boolean {
  const [tenant, ...rest] = key.split('/');

  return (
    tenant === tenantId &&
    rest.length > 0 &&
    !rest.some((segment) => UNSAFE_SEGMENTS.has(segment))
  );
}

export function isCurrentTenantFileKey(key: string): boolean {
  const tenantId = TenantContextStorage.findTenantId();

  return tenantId !== null && isTenantFileKey(key, tenantId);
}
