import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { SentryErrorReporterModule } from './sentry-error-reporter.module';

export default defineHeryModule({
  name: '@heryjs/error-reporter-sentry',
  module: () => SentryErrorReporterModule,
  options: noOptions,
  requires: [],
  extensionPoints: ['error-reporter.driver'],
});
