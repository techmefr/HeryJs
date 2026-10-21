import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '#technical/auth/auth.module';
import { HealthModule } from '#technical/health/health.module';
import { HealthController } from './health.controller';
import { HealthProbeController } from './health-probe.controller';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';

@Module({
  imports: [AuthModule, HealthModule],
  controllers: [HealthController, HealthProbeController, MetricsController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
})
export class MonitoringModule {}
