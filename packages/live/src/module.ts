import pc from 'picocolors';
import { defineModule } from '../../../cli/lib/module-definition';

export default defineModule({
  name: 'live',
  description:
    'Add bidirectional WebSocket support (Socket.IO). Use "hery generate <Name> --live" to add a live gateway to a resource.',
  meta: { compatibility: '>=0.0.1' },
  dest: 'src/modules/live',
  dependencies: [
    '@nestjs/websockets',
    '@nestjs/platform-socket.io',
    'socket.io',
  ],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Run "hery generate <Name> --live" to add a live gateway to a resource',
      `Import ${pc.bold('LiveModule')} and add ${pc.bold('<Name>LiveGateway')} to the imports/providers of <name>.module.ts`,
      `Clients connect with "io('/live/<name>', { auth: { token } })" using the same bearer token as REST`,
    ]);
  },
});
