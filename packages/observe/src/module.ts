import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'observe',
  description:
    'Optional APM through @nestjs/observe: traces, errors, jobs and runtime metrics named after your classes (off by default, nothing leaves the process until enabled)',
  meta: { compatibility: '>=0.0.1' },
  dependencies: ['@nestjs/observe'],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      "Add '@heryjs/observe' to the modules list in hery.config.ts",
      'Run "npx @nestjs/observe link" for OBSERVE_APP_KEY and OBSERVE_APP_SECRET, then set OBSERVE_ENABLED=true',
      'Self-hosting a collector: set OBSERVE_ENDPOINT. Logs and source context stay off unless OBSERVE_FORWARD_LOGS and OBSERVE_SOURCE_CONTEXT are true',
    ]);
  },
} satisfies ModuleDefinition;
