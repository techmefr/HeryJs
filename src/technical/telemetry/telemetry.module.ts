import { Module, OnApplicationShutdown } from '@nestjs/common';
import { shutdownTelemetry } from './start-telemetry';
import { TelemetryMiddleware } from './telemetry.middleware';

@Module({
  providers: [TelemetryMiddleware],
  exports: [TelemetryMiddleware],
})
export class TelemetryModule implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await shutdownTelemetry();
  }
}
