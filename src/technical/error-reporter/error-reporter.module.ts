import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HeryConfigModule } from '#technical/config/hery-config.module';
import { DriversModule } from '#technical/drivers/drivers.module';
import { ErrorReporterDriverRegistry } from './error-reporter-driver.registry';
import { ErrorReporterService } from './error-reporter.service';
import { ErrorRequestMiddleware } from './error-request.middleware';
import { NoopErrorReporterDriver } from './noop-error-reporter.driver';

@Global()
@Module({
  imports: [HeryConfigModule, DriversModule],
  providers: [
    ErrorReporterService,
    ErrorReporterDriverRegistry,
    NoopErrorReporterDriver,
  ],
  exports: [ErrorReporterService],
})
export class ErrorReporterModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ErrorRequestMiddleware).forRoutes('*');
  }
}
