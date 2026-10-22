import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Response } from 'express';
import type { AuthenticatedUser } from '#kernel/auth/auth.types';
import type { RequestWithUser } from '#kernel/auth/session.guard';
import type { CapabilitySubject } from '#kernel/capabilities/capabilities.types';
import { McpGatewayController } from './mcp-gateway.controller';

function callerOf(tenantId: string, id: string): AuthenticatedUser {
  return {
    id,
    email: `${id}@example.com`,
    tenantId,
    teamIds: [`team-of-${id}`],
    currentTeamId: `team-of-${id}`,
    role: 'member',
    impersonatedBy: null,
  };
}

function requestFrom(user: AuthenticatedUser): RequestWithUser {
  return { user, body: {} } as unknown as RequestWithUser;
}

describe('tenant isolation', () => {
  beforeEach(() => {
    jest
      .spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds a fresh server per request, registered with that caller only', async () => {
    const seen: Array<{ server: McpServer; subject: CapabilitySubject }> = [];
    const controller = new McpGatewayController([
      { register: (server, subject) => seen.push({ server, subject }) },
    ]);
    const response = {} as Response;

    await controller.handle(
      requestFrom(callerOf('tenant-a', 'alice')),
      response,
    );
    await controller.handle(requestFrom(callerOf('tenant-b', 'bob')), response);

    expect(seen).toHaveLength(2);
    expect(seen[0]?.server).not.toBe(seen[1]?.server);
    expect(seen[0]?.subject).toEqual({
      id: 'alice',
      teamIds: ['team-of-alice'],
      currentTeamId: 'team-of-alice',
      role: 'member',
    });
    expect(seen[1]?.subject).toEqual({
      id: 'bob',
      teamIds: ['team-of-bob'],
      currentTeamId: 'team-of-bob',
      role: 'member',
    });
  });
});
