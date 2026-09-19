import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'peer',
  description:
    'WebRTC signalling and TURN credentials over the socket.io gateway the live module already runs -- offer/answer/ICE exchange, capability-gated rooms, presence. No media server, no SFU, no recording.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [
    '@nestjs/websockets',
    '@nestjs/platform-socket.io',
    'socket.io',
  ],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Run "hery install live" first if not already installed: peer signals over its gateway rather than opening a second one',
      'Import "PeerModule" and add "PeerGateway" to the imports/providers of app.module.ts',
      'Set PEER_TURN_SECRET (and, in production, PEER_TURN_URIS) before minting TURN credentials',
      'Clients connect with "io(\'/peer\', { auth: { token } })" using the same bearer token as REST, then join a room and exchange offer/answer/ice-candidate events',
    ]);
  },
} satisfies ModuleDefinition;
