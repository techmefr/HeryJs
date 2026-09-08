import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AUTH_PROVIDER } from '#kernel/auth/auth.types';
import type { AuthProvider, AuthenticatedUser } from '#kernel/auth/auth.types';
import { SessionGuard } from '#kernel/auth/session.guard';
import { CapabilitiesGuard } from '#kernel/capabilities/capabilities.guard';
import type { CapabilitySubject } from '#kernel/capabilities/capabilities.types';
import { McpGatewayController } from '../src/runtime/mcp-gateway.controller';
import { MCP_TOOL_REGISTRARS } from '../src/runtime/mcp-tool-registrar';
import type { McpToolRegistrar } from '../src/runtime/mcp-tool-registrar';

/**
 * This one speaks the protocol over http with the SDK's own client rather than
 * asserting on the controller's metadata, because nothing this gateway does is
 * observable otherwise: the tools a caller can list come from registrars the
 * controller resolves per request, and the transport is stateless, so a server
 * is built and torn down inside every single call. A mistake anywhere in that
 * wiring type-checks, lints, and answers a well-formed session with no tools
 * in it.
 *
 * Both guards are the real ones. Only the auth provider is a stand-in, since
 * resolving a bearer token is the one step that needs better-auth and a
 * database -- what the resolved caller may then do has to be decided by the
 * kernel here, not by a stub.
 */
const CALLER: AuthenticatedUser = {
  id: 'user-1',
  email: 'caller@example.com',
  tenantId: 'acme',
  teamIds: ['team-1'],
  currentTeamId: 'team-1',
  role: 'member',
  impersonatedBy: null,
};

const VALID_TOKEN = 'a-valid-token';

const authProvider = {
  validateSession: (token: string) =>
    Promise.resolve(token === VALID_TOKEN ? CALLER : null),
  validateApiKey: () => Promise.resolve(null),
} as unknown as AuthProvider;

const subjectsSeen: CapabilitySubject[] = [];

class ProbeRegistrar implements McpToolRegistrar {
  register(server: McpServer, subject: CapabilitySubject) {
    subjectsSeen.push(subject);

    server.registerTool(
      'whoami',
      { description: 'Answers with the subject the gateway resolved' },
      () => ({ content: [{ type: 'text' as const, text: subject.id }] }),
    );
  }
}

class OtherProbeRegistrar implements McpToolRegistrar {
  register(server: McpServer) {
    server.registerTool('ping', { description: 'Answers pong' }, () => ({
      content: [{ type: 'text' as const, text: 'pong' }],
    }));
  }
}

@Module({
  controllers: [McpGatewayController],
  providers: [
    SessionGuard,
    CapabilitiesGuard,
    { provide: AUTH_PROVIDER, useValue: authProvider },
    ProbeRegistrar,
    OtherProbeRegistrar,
    {
      provide: MCP_TOOL_REGISTRARS,
      useFactory: (...instances: McpToolRegistrar[]) => instances,
      inject: [ProbeRegistrar, OtherProbeRegistrar],
    },
  ],
})
class ProbeAppModule {}

let app: INestApplication;
let url: string;

async function connectedClient(token = VALID_TOKEN): Promise<Client> {
  const client = new Client({ name: 'probe', version: '0.0.1' });

  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );

  return client;
}

beforeAll(async () => {
  app = await NestFactory.create(ProbeAppModule, { logger: false });
  // Port 0 so a developer running this next to a live app does not fight it
  // for a port, and so two of these can run at once on a CI runner.
  await app.listen(0);
  url = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  subjectsSeen.length = 0;
});

describe('the mcp gateway', () => {
  it('completes an MCP handshake over http', async () => {
    const client = await connectedClient();

    expect(client.getServerVersion()).toEqual(
      expect.objectContaining({ name: 'heryjs' }),
    );

    await client.close();
  });

  it('lists the tools every registrar contributed', async () => {
    const client = await connectedClient();

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual(['ping', 'whoami']);

    await client.close();
  });

  it('calls a tool and answers with its result', async () => {
    const client = await connectedClient();

    const result = await client.callTool({ name: 'whoami', arguments: {} });

    expect(result.content).toEqual([{ type: 'text', text: CALLER.id }]);

    await client.close();
  });

  // A registrar has nothing but this subject to decide what the session may
  // see. Handed the raw user, or one built from an empty object, every tool
  // behind this gateway would answer for the wrong person.
  it('hands each registrar the subject the kernel resolved', async () => {
    const client = await connectedClient();

    await client.listTools();

    expect(subjectsSeen).toContainEqual({
      id: CALLER.id,
      teamIds: CALLER.teamIds,
      currentTeamId: CALLER.currentTeamId,
      role: CALLER.role,
    });

    await client.close();
  });

  it('refuses a token it cannot resolve, before reaching a registrar', async () => {
    await expect(connectedClient('a-stale-token')).rejects.toThrow();
    expect(subjectsSeen).toEqual([]);
  });

  it('refuses a caller carrying no token at all', async () => {
    const response = await fetch(`${url}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    expect(response.status).toBe(401);
    expect(subjectsSeen).toEqual([]);
  });

  // The transport is built with no session id generator, so nothing is kept
  // between requests and each one has to stand on its own -- which is also
  // what keeps one caller's server from answering the next caller's request.
  it('serves a second session without carrying the first one over', async () => {
    const first = await connectedClient();
    await first.listTools();
    await first.close();

    const second = await connectedClient();

    expect((await second.listTools()).tools).toHaveLength(2);

    await second.close();
  });
});
