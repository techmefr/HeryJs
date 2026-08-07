import { TenantContextStorage } from './tenant-context';

/**
 * The tenant boundary for work that never went through TenantMiddleware: a
 * queue worker, a scheduled task, a CLI backfill. None of them has a request to
 * resolve the tenant from, so each one opens the context itself, from the tenant
 * the job it is running already carries.
 *
 * There is no ambient default on purpose. A worker writing tenant-scoped rows
 * outside a context does not silently land them somewhere plausible -- it
 * throws, and this is the one line that fixes it.
 */
export function runInTenant<T>(
  tenantId: string,
  fn: () => Promise<T>,
  actor?: { userId?: string | null; impersonatedBy?: string | null },
): Promise<T> {
  return TenantContextStorage.run(
    {
      tenantId,
      userId: actor?.userId ?? null,
      impersonatedBy: actor?.impersonatedBy ?? null,
    },
    fn,
  );
}
