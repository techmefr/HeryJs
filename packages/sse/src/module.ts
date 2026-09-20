import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'sse',
  description:
    'Server-Sent Events sourced from the events bus, with Last-Event-ID replay off a bounded Valkey backlog -- the cheaper half of realtime for a server pushing an update to a browser with nothing to say back.',
  meta: { compatibility: '>=0.0.1' },
  dependencies: ['ioredis'],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      'Import "SseModule" into src/app.module.ts',
      'Set SSE_TOKEN_SECRET in production -- the dev default refuses to run there',
      'Add "SseStreamService" to any EventListener that should reach a browser: call ".publish(tenantId, channel, event.constructor.name, payload)" from inside handle()',
      'Clients: POST /sse/token with a session, then EventSource(`/sse/stream?token=...&channels=...`) -- the browser resends Last-Event-ID on reconnect automatically',
    ]);
  },
} satisfies ModuleDefinition;
