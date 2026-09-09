import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'live',
  description:
    'Add bidirectional WebSocket support (Socket.IO). Use "hery generate <Name> --live" to add a live gateway to a resource.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [
    '@nestjs/websockets',
    '@nestjs/platform-socket.io',
    'socket.io',
  ],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Run "hery generate <Name> --live" to add a live gateway to a resource',
      `Import "LiveModule" and add "<Name>LiveGateway" to the imports/providers of <name>.module.ts`,
      `Clients connect with "io('/live/<name>', { auth: { token } })" using the same bearer token as REST`,
    ]);
  },
} satisfies ModuleDefinition;
