// Moved to the kernel alongside socket-auth.guard.ts, for the same reason:
// peer needs the identical tenant-context derivation over its own gateway,
// and a module reaching another module's helper is the boundary this
// re-export avoids breaking for existing callers of `live`.
export { withTenant } from '#kernel/websocket/with-tenant';
