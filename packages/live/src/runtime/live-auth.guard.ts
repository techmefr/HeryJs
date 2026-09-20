// The socket-auth mechanism moved to the kernel (#kernel/websocket) once a
// second module (peer) needed the exact same auth path over its own
// gateway -- a module reaching another module's guard is what the kernel
// boundary exists to prevent. Re-exported here under live's own names so
// nothing that already imports LiveAuthGuard/LiveSocket from this module
// has to change.
export {
  authenticateSocket as authenticateLiveSocket,
  SocketAuthGuard as LiveAuthGuard,
} from '#kernel/websocket/socket-auth.guard';
export type { AuthenticatedSocket as LiveSocket } from '#kernel/websocket/socket-auth.guard';
