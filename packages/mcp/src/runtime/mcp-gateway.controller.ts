import { All, Inject, Req, Res, UseGuards } from '@nestjs/common';
import { Controller } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { SessionGuard } from '#kernel/auth/session.guard';
import type { RequestWithUser } from '#kernel/auth/session.guard';
import { CapabilitiesGuard } from '#kernel/capabilities/capabilities.guard';
import { Capability } from '#kernel/capabilities/capability.decorator';
import { subjectOf } from '#kernel/capabilities/subject';
import { canReachMcpGateway } from './mcp.policy';
import { MCP_TOOL_REGISTRARS } from './mcp-tool-registrar';
import type { McpToolRegistrar } from './mcp-tool-registrar';

@Controller('mcp')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class McpGatewayController {
  constructor(
    @Inject(MCP_TOOL_REGISTRARS)
    private readonly registrars: McpToolRegistrar[],
  ) {}

  @All()
  @Capability(canReachMcpGateway)
  async handle(@Req() req: RequestWithUser, @Res() res: Response) {
    const subject = subjectOf(req.user);
    const server = new McpServer({ name: 'heryjs', version: '0.0.1' });

    for (const registrar of this.registrars) {
      registrar.register(server, subject);
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    await transport.handleRequest(req as Request, res, req.body);
  }
}
