import { Global, Module } from '@nestjs/common';
import { errorReporterDriverToken } from '@heryjs/core/drivers';
import { SentryErrorReporterDriver } from './sentry-error-reporter.driver';

const TOKEN = errorReporterDriverToken('sentry');

@Global()
@Module({
  providers: [
    SentryErrorReporterDriver,
    { provide: TOKEN, useExisting: SentryErrorReporterDriver },
  ],
  exports: [TOKEN],
})
export class SentryErrorReporterModule {}
