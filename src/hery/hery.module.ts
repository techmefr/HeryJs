import { Module } from '@nestjs/common';
import type {
  DynamicModule,
  MiddlewareConsumer,
  NestModule,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import {
  AdminStudioModule,
  EtagModule,
  IdempotencyModule,
  OutputCacheModule,
  RateLimitModule,
  SecurityHeadersMiddleware,
} from '../technical/public/http';
import { AuditModule, PrivacyModule } from '../technical/public/privacy';
import { AuthModule } from '../technical/public/auth';
import {
  CacheModule,
  EventsModule,
  ExpositionModule,
  FeatureFlagsModule,
  IntrospectionModule,
  MaintenanceMiddleware,
  MaintenanceModule,
  QuotasModule,
} from '../technical/public/platform';
import { ChangeFeedModule, SignalModule } from '../technical/public/realtime';
import {
  ErrorReporterModule,
  LogShippingModule,
  MonitoringModule,
  TelemetryMiddleware,
  TelemetryModule,
  httpLogRedaction,
  logShippingStream,
  telemetryPinoOptions,
  tenantLogMixin,
} from '../technical/public/observability';
import {
  JobFlowsModule,
  JobsModule,
  OutboxModule,
  SchedulerModule,
} from '../technical/public/jobs';
import { NotificationsModule } from '../technical/public/notifications';
import {
  BackupModule,
  PruneModule,
  SeedersModule,
} from '../technical/public/database';
import { SecretsModule, env } from '../technical/public/env';
import { TeamsModule, TenantMiddleware } from '../technical/public/tenancy';
import { LocaleMiddleware } from '../technical/public/i18n';
import { DomainExceptionFilter } from '../technical/public/errors';
import type { HeryConfig } from '../technical/public/config';
import {
  loadHeryModules,
  resolveHeryModules,
} from '../technical/public/modules';
import type { HeryModuleContract } from '../technical/public/modules';
import {
  DevDashboardMiddleware,
  DevDashboardModule,
  InspectorMiddleware,
  InspectorModule,
  PipelineMiddleware,
  PipelineModule,
} from '../devtools/public';

function loggerModule(): DynamicModule {
  const telemetryOptions = telemetryPinoOptions();

  return LoggerModule.forRoot({
    pinoHttp: [
      {
        ...telemetryOptions,
        level:
          env.LOG_LEVEL ??
          (process.env.NODE_ENV === 'test'
            ? 'silent'
            : process.env.NODE_ENV === 'production'
              ? 'info'
              : 'debug'),
        mixin: () => ({
          ...telemetryOptions.mixin?.(),
          ...tenantLogMixin(),
        }),
        transport:
          process.env.NODE_ENV === 'production' ||
          process.env.NODE_ENV === 'test'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        ...httpLogRedaction,
      },
      logShippingStream,
    ],
  });
}

/**
 * The kernel, then every module hery.config.ts declares, with their options
 * validated. Each module is loaded from its package by name unless the
 * installed contracts are passed in. A project's AppModule imports this and its own business modules,
 * nothing else.
 */
@Module({})
export class HeryModule implements NestModule {
  static forRoot(
    config: HeryConfig,
    installed: readonly HeryModuleContract[] = loadHeryModules(
      config.modules ?? [],
    ),
  ): DynamicModule {
    return {
      module: HeryModule,
      imports: [
        loggerModule(),
        AdminStudioModule,
        AuditModule,
        AuthModule,
        CacheModule,
        ChangeFeedModule,
        DevDashboardModule,
        EtagModule,
        ErrorReporterModule,
        EventsModule,
        ExpositionModule,
        FeatureFlagsModule,
        IdempotencyModule,
        InspectorModule,
        IntrospectionModule,
        JobFlowsModule,
        JobsModule,
        LogShippingModule,
        MaintenanceModule,
        MonitoringModule,
        NotificationsModule,
        OutboxModule,
        OutputCacheModule,
        PipelineModule,
        PrivacyModule,
        BackupModule,
        PruneModule,
        QuotasModule,
        RateLimitModule,
        SchedulerModule,
        SecretsModule,
        SeedersModule.forRoot([]),
        SignalModule,
        TeamsModule,
        TelemetryModule,
        ...resolveHeryModules(config.modules ?? [], installed),
      ],
      providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    // Headers first, so they are set on a response even when something
    // downstream fails before reaching a handler. Trace opens next, and outside
    // everything else, so every guard, interceptor, handler, and Prisma call
    // downstream (tenant resolution included) can attach a step to the same
    // request-scoped context.
    consumer.apply(TelemetryMiddleware).forRoutes('*');
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
    consumer.apply(MaintenanceMiddleware).forRoutes('*');
    consumer.apply(LocaleMiddleware).forRoutes('*');
    consumer.apply(DevDashboardMiddleware).forRoutes('*');
    consumer.apply(PipelineMiddleware).forRoutes('*');
    consumer.apply(TenantMiddleware).forRoutes('*');
    consumer.apply(InspectorMiddleware).forRoutes('*');
  }
}
