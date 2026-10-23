import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminStudioModule } from '#technical/admin/admin-studio.module';
import { AuditModule } from '#technical/audit/audit.module';
import { AuthModule } from '#technical/auth/auth.module';
import { CacheModule } from '#technical/cache/cache.module';
import { ChangeFeedModule } from '#technical/change-feed/change-feed.module';
import { ErrorReporterModule } from '#technical/error-reporter/error-reporter.module';
import { EventsModule } from '#technical/events/events.module';
import { ExpositionModule } from '#technical/exposition/exposition.module';
import { IntrospectionModule } from '#technical/introspection/introspection.module';
import { FeatureFlagsModule } from '#technical/feature-flags/feature-flags.module';
import { IdempotencyModule } from '#technical/idempotency/idempotency.module';
import { DevDashboardModule } from '#devtools/dashboard/dev-dashboard.module';
import { DevDashboardMiddleware } from '#devtools/dashboard/dev-dashboard.middleware';
import { InspectorModule } from '#devtools/inspector/inspector.module';
import { PipelineModule } from '#devtools/pipeline/pipeline.module';
import { ImpersonationModule } from '#modules/impersonation/impersonation.module';
import { JobFlowsModule } from '#technical/job-flows/job-flows.module';
import { JobsModule } from '#technical/jobs/jobs.module';
import { ExportModule } from '#modules/export/export.module';
import { MailModule } from '#modules/mail/mail.module';
import { MaintenanceModule } from '#technical/maintenance/maintenance.module';
import { MaintenanceMiddleware } from '#technical/maintenance/maintenance.middleware';
import { MonitoringModule } from '#technical/monitoring/monitoring.module';
import { OutboxModule } from '#technical/outbox/outbox.module';
import { NotificationsModule } from '#technical/notifications/notifications.module';
import { PrivacyModule } from '#technical/privacy/privacy.module';
import { BackupModule } from '#technical/backup/backup.module';
import { PruneModule } from '#technical/prune/prune.module';
import { QuotasModule } from '#technical/quotas/quotas.module';
import { OutputCacheModule } from '#technical/output-cache/output-cache.module';
import { RateLimitModule } from '#technical/rate-limit/rate-limit.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { SecretsModule } from '#technical/secrets/secrets.module';
import { SecurityHeadersMiddleware } from '#technical/http/security-headers.middleware';
import { EtagModule } from '#technical/http/etag.module';
import { SeedersModule } from '#technical/seeders/seeders.module';
import { StorageModule } from '#modules/storage/storage.module';
import { TeamsModule } from '#technical/teams/teams.module';
import { WebhooksModule } from '#modules/webhooks/webhooks.module';
import { InspectorMiddleware } from '#devtools/inspector/inspector.middleware';
import { PipelineMiddleware } from '#devtools/pipeline/pipeline.middleware';
import { SignalModule } from '#technical/signal/signal.module';
import { SseModule } from '#modules/sse/sse.module';
import { OAuthModule } from '#modules/oauth/oauth.module';
import { SsoModule } from '#modules/sso/sso.module';
import { ScimModule } from '#modules/scim/scim.module';
import { LocaleMiddleware } from '#technical/i18n/locale.middleware';
import { TenantMiddleware } from '#technical/tenancy/tenant.middleware';
import { DomainExceptionFilter } from '#technical/errors/domain-exception.filter';
import { TelemetryModule } from '#technical/telemetry/telemetry.module';
import { TelemetryMiddleware } from '#technical/telemetry/telemetry.middleware';
import { telemetryPinoOptions } from '#technical/telemetry/telemetry-logs';
import { tenantLogMixin } from '#technical/logging/tenant-log-mixin';
import { logShippingStream } from '#technical/logging/log.pipeline';
import { LogShippingModule } from '#technical/logging/log-shipping.module';
import { env } from '#technical/config/env';
import { httpLogRedaction } from '#technical/logging/http-log-redaction';

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
