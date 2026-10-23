import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
  AdminStudioModule,
  IdempotencyModule,
  OutputCacheModule,
  RateLimitModule,
  SecurityHeadersMiddleware,
  EtagModule,
} from '@heryjs/core/http';
import { AuditModule, PrivacyModule } from '@heryjs/core/privacy';
import { AuthModule } from '@heryjs/core/auth';
import {
  CacheModule,
  EventsModule,
  ExpositionModule,
  IntrospectionModule,
  FeatureFlagsModule,
  MaintenanceModule,
  MaintenanceMiddleware,
  QuotasModule,
} from '@heryjs/core/platform';
import { ChangeFeedModule, SignalModule } from '@heryjs/core/realtime';
import {
  ErrorReporterModule,
  MonitoringModule,
  TelemetryModule,
  TelemetryMiddleware,
  telemetryPinoOptions,
  tenantLogMixin,
  logShippingStream,
  LogShippingModule,
  httpLogRedaction,
} from '@heryjs/core/observability';
import {
  DevDashboardModule,
  DevDashboardMiddleware,
  InspectorModule,
  PipelineModule,
  InspectorMiddleware,
  PipelineMiddleware,
} from '@heryjs/core/devtools';
import { ImpersonationModule } from '#modules/impersonation/impersonation.module';
import {
  JobFlowsModule,
  JobsModule,
  OutboxModule,
  SchedulerModule,
} from '@heryjs/core/jobs';
import { ExportModule } from '#modules/export/export.module';
import { MailModule } from '#modules/mail/mail.module';
import { NotificationsModule } from '@heryjs/core/notifications';
import {
  BackupModule,
  PruneModule,
  SeedersModule,
} from '@heryjs/core/database';
import { SecretsModule, env } from '@heryjs/core/env';
import { StorageModule } from '#modules/storage/storage.module';
import { TeamsModule, TenantMiddleware } from '@heryjs/core/tenancy';
import { WebhooksModule } from '#modules/webhooks/webhooks.module';
import { SseModule } from '#modules/sse/sse.module';
import { OAuthModule } from '#modules/oauth/oauth.module';
import { SsoModule } from '#modules/sso/sso.module';
import { ScimModule } from '#modules/scim/scim.module';
import { LocaleMiddleware } from '@heryjs/core/i18n';
import { DomainExceptionFilter } from '@heryjs/core/errors';

const telemetryOptions = telemetryPinoOptions();

@Module({
  imports: [
    LoggerModule.forRoot({
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
    }),
    AdminStudioModule,
    AuditModule,
    AuthModule,
    CacheModule,
    ChangeFeedModule,
    DevDashboardModule,
    EtagModule,
    ErrorReporterModule,
    EventsModule,
    ExportModule,
    ExpositionModule,
    FeatureFlagsModule,
    IdempotencyModule,
    ImpersonationModule,
    InspectorModule,
    IntrospectionModule,
    JobFlowsModule,
    JobsModule,
    LogShippingModule,
    MailModule,
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
    OAuthModule.forRoot(),
    SchedulerModule,
    SecretsModule,
    SeedersModule.forRoot([]),
    SignalModule,
    SseModule,
    SsoModule.forRoot(),
    ScimModule,
    StorageModule,
    TeamsModule,
    TelemetryModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule implements NestModule {
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
