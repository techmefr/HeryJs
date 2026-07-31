import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from '#technical/audit/audit.module';
import { AuthModule } from '#technical/auth/auth.module';
import { DescribeModule } from '#technical/describe/describe.module';
import { FeatureFlagsModule } from '#technical/feature-flags/feature-flags.module';
import { InspectorModule } from '#devtools/inspector/inspector.module';
import { ImpersonationModule } from '#modules/impersonation/impersonation.module';
import { JobsModule } from '#technical/jobs/jobs.module';
import { MailModule } from '#modules/mail/mail.module';
import { MonitoringModule } from '#technical/monitoring/monitoring.module';
import { NotificationsModule } from '#technical/notifications/notifications.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { SeedersModule } from '#technical/seeders/seeders.module';
import { StorageModule } from '#modules/storage/storage.module';
import { TeamsModule } from '#technical/teams/teams.module';
import { InspectorMiddleware } from '#devtools/inspector/inspector.middleware';
import { SignalModule } from '#technical/signal/signal.module';
import { TenantMiddleware } from '#technical/tenancy/tenant.middleware';
import { DomainExceptionFilter } from '#technical/errors/domain-exception.filter';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          process.env.NODE_ENV === 'test'
            ? 'silent'
            : process.env.NODE_ENV === 'production'
              ? 'info'
              : 'debug',
        transport:
          process.env.NODE_ENV === 'production' ||
          process.env.NODE_ENV === 'test'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        // A bearer token IS a live session (or, for up to 30 minutes, an
        // impersonation session) -- logging it verbatim on every request is
        // equivalent to logging the password. redact() below drops the value
        // rather than the whole header, so the rest of pino-http's default
        // request serializer is unaffected.
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie'],
          censor: '[redacted]',
        },
      },
    }),
    AuditModule,
    AuthModule,
    DescribeModule,
    FeatureFlagsModule,
    ImpersonationModule,
    InspectorModule,
    JobsModule,
    MailModule,
    MonitoringModule,
    NotificationsModule,
    SchedulerModule,
    SeedersModule.forRoot([]),
    SignalModule,
    StorageModule,
    TeamsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
    consumer.apply(InspectorMiddleware).forRoutes('*');
  }
}
