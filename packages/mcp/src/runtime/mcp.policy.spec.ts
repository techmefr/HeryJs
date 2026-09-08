import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { CapabilitySubject } from '#kernel/capabilities/capabilities.types';
import { CAPABILITY_CHECK } from '#kernel/capabilities/capability.decorator';
import type { PolicyCheck } from '#kernel/capabilities/capability-check';
import { SessionGuard } from '#kernel/auth/session.guard';
import { CapabilitiesGuard } from '#kernel/capabilities/capabilities.guard';
import { McpGatewayController } from './mcp-gateway.controller';
import { canReachMcpGateway } from './mcp.policy';

function metadata<T>(key: string, target: object): T | undefined {
  return Reflect.getMetadata(key, target) as T | undefined;
}

function handlerOf(name: string): object {
  return Object.getOwnPropertyDescriptor(McpGatewayController.prototype, name)
    ?.value as object;
}

const ANONYMOUS_LOOKING: CapabilitySubject = {
  id: 'user-1',
  teamIds: [],
  currentTeamId: null,
  role: null,
};

describe('reaching the MCP gateway', () => {
  // The gateway exposes nothing by itself, so opening a session is granted to
  // whoever got past the session guard -- including a caller with no role and
  // no team, who would be denied by any preset above `own`.
  it('lets a caller with no role and no team open a session', () => {
    expect(canReachMcpGateway(ANONYMOUS_LOOKING)).toEqual({
      allowed: true,
      scope: 'own',
    });
  });

  // What keeps this from being an open door is the scope it hands down: every
  // registrar reads it to decide what this subject may see, so a widening here
  // would silently widen every tool at once.
  it('hands down the narrowest scope', () => {
    expect(canReachMcpGateway(ANONYMOUS_LOOKING).scope).toBe('own');
  });
});

describe('the MCP gateway controller', () => {
  it('resolves a session before the policy runs', () => {
    const guards = metadata<unknown[]>(GUARDS_METADATA, McpGatewayController);

    expect(guards).toEqual([SessionGuard, CapabilitiesGuard]);
  });

  // An unguarded @All() on this controller would answer an MCP session to an
  // anonymous caller, and the registrars would then be handed a subject built
  // from nothing.
  it('carries the gateway policy on its handler', () => {
    const check = metadata<PolicyCheck>(CAPABILITY_CHECK, handlerOf('handle'));

    expect(check).toBe(canReachMcpGateway);
  });
});
