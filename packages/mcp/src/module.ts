import pc from 'picocolors';
import { defineModule } from '../../../cli/lib/module-definition';

export default defineModule({
  name: 'mcp',
  description:
    'Add an authenticated MCP gateway (Streamable HTTP, stateless) exposing generated resources as tools. Use "hery generate <Name> --mcp" to add write tools to a resource.',
  meta: { compatibility: '>=0.0.1' },
  dest: 'src/technical/mcp',
  dependencies: ['@modelcontextprotocol/sdk'],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Run "hery generate <Name> --mcp" to add a tool registrar to a resource',
      "Export that registrar from the resource's own module (provider + exports)",
      `Import ${pc.bold('McpGatewayModule.forRoot({ imports, registrars })')} into src/app.module.ts, listing each resource module and its registrar`,
    ]);
  },
});
