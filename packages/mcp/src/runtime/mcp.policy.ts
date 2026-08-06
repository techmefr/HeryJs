import type { PolicyCheck } from '#kernel/capabilities/capability-check';

// The gateway itself exposes nothing: each registrar decides, per tool and per
// call, what this subject may see. So this answers only "may the caller open an
// MCP session at all", and the real decisions stay one layer in -- the same
// split the exposition registry uses.
export const canReachMcpGateway: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});
