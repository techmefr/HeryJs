import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'stream',
  description:
    'Add one-to-many audio/video streaming via LiveKit (SFU). Use "hery generate <Name> --stream" to add publish/viewer token endpoints to a resource.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: ['livekit-server-sdk'],
  install(context) {
    context.copyPackageFile('docker-compose.stream.yml');
    context.copyRuntime();

    context.nextSteps([
      'Run "docker compose -f docker-compose.stream.yml up -d" (dev mode, key "devkey"/"secret")',
      'Run "hery generate <Name> --stream" to add publish/viewer token endpoints to a resource',
      `Import "StreamModule" and add "<Name>StreamController" to <name>.module.ts`,
    ]);
  },
} satisfies ModuleDefinition;
