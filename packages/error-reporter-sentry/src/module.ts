import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'error-reporter-sentry',
  description:
    'Report unexpected errors to Sentry instead of dropping them (driver, env, DI wiring)',
  meta: { compatibility: '>=0.0.1' },
  dependencies: [],
  install(context) {
    context.copyRuntime();

    context.nextSteps([
      "Declare it in hery.config.ts, e.g. { errorReporter: { default: process.env.ERROR_REPORTER ?? 'noop', drivers: { noop: { driver: 'noop' }, sentry: { driver: 'sentry' } } } }",
      'Set SENTRY_DSN in .env, then ERROR_REPORTER=sentry to switch',
    ]);
  },
} satisfies ModuleDefinition;
