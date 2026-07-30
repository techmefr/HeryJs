import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WorkoutModule } from './functional/workout/workout.module';
import { WorkoutSeeder } from './functional/workout/workout.seeder';
import { AuditModule } from './technical/audit/audit.module';
import { AuthModule } from './technical/auth/auth.module';
import { DescribeModule } from './technical/describe/describe.module';
import { FeatureFlagsModule } from './technical/feature-flags/feature-flags.module';
import { InspectorModule } from './technical/inspector/inspector.module';
import { JobsModule } from './technical/jobs/jobs.module';
import { MailModule } from './technical/mail/mail.module';
import { MonitoringModule } from './technical/monitoring/monitoring.module';
import { NotificationsModule } from './technical/notifications/notifications.module';
import { SchedulerModule } from './technical/scheduler/scheduler.module';
import { SeedersModule } from './technical/seeders/seeders.module';
import { StorageModule } from './technical/storage/storage.module';
import { InspectorMiddleware } from './technical/inspector/inspector.middleware';
import { SignalModule } from './technical/signal/signal.module';
import { TenantMiddleware } from './technical/tenancy/tenant.middleware';
import { DomainExceptionFilter } from './technical/errors/domain-exception.filter';

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
      },
    }),
    AuditModule,
    AuthModule,
    DescribeModule,
    FeatureFlagsModule,
    InspectorModule,
    JobsModule,
    MailModule,
    MonitoringModule,
    NotificationsModule,
    SchedulerModule,
    SeedersModule.forRoot([WorkoutSeeder]),
    SignalModule,
    StorageModule,
    WorkoutModule,
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
