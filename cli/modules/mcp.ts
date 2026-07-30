import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../lib/module-registry';

const REGISTRAR_FILE = 'src/technical/mcp/mcp-tool-registrar.ts';
const MODULE_FILE = 'src/technical/mcp/mcp-gateway.module.ts';
const CONTROLLER_FILE = 'src/technical/mcp/mcp-gateway.controller.ts';

const REGISTRAR_CONTENT = `import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CapabilitySubject } from '../capabilities/capabilities.types';

export interface McpToolRegistrar {
  register(server: McpServer, subject: CapabilitySubject): void;
}

export const MCP_TOOL_REGISTRARS = Symbol('MCP_TOOL_REGISTRARS');
`;

const MODULE_CONTENT = `import { DynamicModule, Module, Type } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { McpGatewayController } from './mcp-gateway.controller';
import { MCP_TOOL_REGISTRARS } from './mcp-tool-registrar';
import type { McpToolRegistrar } from './mcp-tool-registrar';

interface McpGatewayOptions {
  imports: DynamicModule['imports'];
  registrars: Type<McpToolRegistrar>[];
}

@Module({})
export class McpGatewayModule {
  static forRoot(options: McpGatewayOptions): DynamicModule {
    return {
      module: McpGatewayModule,
      imports: [AuthModule, ...(options.imports ?? [])],
      controllers: [McpGatewayController],
      providers: [
        {
          provide: MCP_TOOL_REGISTRARS,
          useFactory: (...instances: McpToolRegistrar[]) => instances,
          inject: options.registrars,
        },
      ],
    };
  }
}
`;

const CONTROLLER_CONTENT = `import { All, Inject, Req, Res, UseGuards } from '@nestjs/common';
import { Controller } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { SessionGuard } from '../auth/session.guard';
import type { RequestWithUser } from '../auth/session.guard';
import { subjectOf } from '../capabilities/subject';
import { MCP_TOOL_REGISTRARS } from './mcp-tool-registrar';
import type { McpToolRegistrar } from './mcp-tool-registrar';

@Controller('mcp')
@UseGuards(SessionGuard)
export class McpGatewayController {
  constructor(
    @Inject(MCP_TOOL_REGISTRARS)
    private readonly registrars: McpToolRegistrar[],
  ) {}

  @All()
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
`;

registerModule({
  name: 'mcp',
  description:
    'Add an authenticated MCP gateway (Streamable HTTP, stateless) exposing generated resources as tools. Use "hery generate <Name> --mcp" to add write tools to a resource.',
  dependencies: ['@modelcontextprotocol/sdk'],
  install() {
    const files: Record<string, string> = {
      [REGISTRAR_FILE]: REGISTRAR_CONTENT,
      [MODULE_FILE]: MODULE_CONTENT,
      [CONTROLLER_FILE]: CONTROLLER_CONTENT,
    };

    for (const [filePath, content] of Object.entries(files)) {
      if (existsSync(filePath)) {
        console.log(pc.yellow(`${filePath} already exists, skipping.`));
        continue;
      }

      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
      console.log(pc.green(`✔ ${filePath}`));
    }

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(
      `  1. Run "hery generate <Name> --mcp" to add a tool registrar to a resource`,
    );
    console.log(
      `  2. Export that registrar from the resource's own module (provider + exports)`,
    );
    console.log(
      `  3. Import ${pc.bold('McpGatewayModule.forRoot({ imports, registrars })')} into src/app.module.ts, listing each resource module and its registrar`,
    );
  },
});
