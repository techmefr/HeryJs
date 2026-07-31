import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../../../cli/lib/module-registry';
import { copyRuntime } from '../../../cli/lib/runtime-copy';

const RUNTIME_DIR = path.join(__dirname, 'runtime');
const DEST_DIR = 'src/modules/live';

registerModule({
  name: 'live',
  channel: 'official',
  description:
    'Add bidirectional WebSocket support (Socket.IO). Use "hery generate <Name> --live" to add a live gateway to a resource.',
  dependencies: [
    '@nestjs/websockets',
    '@nestjs/platform-socket.io',
    'socket.io',
  ],
  install() {
    copyRuntime(RUNTIME_DIR, DEST_DIR);

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(
      `  1. Run "hery generate <Name> --live" to add a live gateway to a resource`,
    );
    console.log(
      `  2. Import ${pc.bold('LiveModule')} and add ${pc.bold('<Name>LiveGateway')} to the imports/providers of <name>.module.ts`,
    );
    console.log(
      `  3. Clients connect with "io('/live/<name>', { auth: { token } })" using the same bearer token as REST`,
    );
  },
});
