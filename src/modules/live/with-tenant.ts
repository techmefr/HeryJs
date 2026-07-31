import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import type { LiveSocket } from './live-auth.guard';

// WebSocket message handlers never go through TenantMiddleware (it only
// wraps the initial HTTP handshake, not each subsequent message on an
// already-open connection), so each handler must open its own tenant
// context explicitly, derived from the user resolved once at connection
// time by LiveAuthGuard -- never trusted from a client-sent field.
export function withTenant<T>(
  client: LiveSocket,
  fn: () => Promise<T>,
): Promise<T> {
  return TenantContextStorage.run({ tenantId: client.data.user.tenantId }, fn);
}
