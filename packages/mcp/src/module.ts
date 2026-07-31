import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../../../cli/lib/module-registry';
import { copyRuntime } from '../../../cli/lib/runtime-copy';

const RUNTIME_DIR = path.join(__dirname, 'runtime');
const DEST_DIR = 'src/technical/mcp';

registerModule({
  name: 'mcp',
  description:
    'Add an authenticated MCP gateway (Streamable HTTP, stateless) exposing generated resources as tools. Use "hery generate <Name> --mcp" to add write tools to a resource.',
  dependencies: ['@modelcontextprotocol/sdk'],
  install() {
    copyRuntime(RUNTIME_DIR, DEST_DIR);

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
