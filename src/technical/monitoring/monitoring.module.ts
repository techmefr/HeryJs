import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '#technical/auth/auth.module';
import { HealthModule } from '#technical/health/health.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { HealthController } from './health.controller';
import { DeploymentController } from './deployment.controller';
import { HealthProbeController } from './health-probe.controller';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';

@Module({
  imports: [AuthModule, HealthModule, PrismaModule],
  controllers: [
    DeploymentController,
    HealthController,
    HealthProbeController,
    MetricsController,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
})
export class MonitoringModule {}
