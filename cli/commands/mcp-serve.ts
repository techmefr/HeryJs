import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Command } from 'commander';
import { z } from 'zod';
import { describeResource, listResources } from '../lib/introspect';

function textResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
  };
}

export function registerMcpServeCommand(program: Command): void {
  program
    .command('mcp:serve')
    .description(
      'Start a read-only MCP server introspecting the generated code',
    )
    .action(async () => {
      const server = new McpServer({ name: 'heryjs', version: '0.0.1' });

      server.registerTool(
        'list_resources',
        {
          description:
            'List the resources actually generated in src/functional (never the blueprints)',
          inputSchema: {},
        },
        () => textResult({ resources: listResources() }),
      );

      server.registerTool(
        'describe_resource',
        {
          description:
            'Describe a generated resource: its routes, the capability guarding each route, and its fields as declared in prisma/schema.prisma',
          inputSchema: { name: z.string() },
        },
        ({ name }) => {
          const description = describeResource(name);

          if (!description) {
            return textResult({
              error: `no generated resource named "${name}"`,
            });
          }

          return textResult(description);
        },
      );

      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
