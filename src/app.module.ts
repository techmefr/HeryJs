import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WorkoutModule } from './functional/workout/workout.module';
import { WorkoutSeeder } from './functional/workout/workout.seeder';
import { AuditModule } from './technical/audit/audit.module';
import { AuthModule } from './technical/auth/auth.module';
import { FeatureFlagsModule } from './technical/feature-flags/feature-flags.module';
import { JobsModule } from './technical/jobs/jobs.module';
import { MonitoringModule } from './technical/monitoring/monitoring.module';
import { NotificationsModule } from './technical/notifications/notifications.module';
import { SeedersModule } from './technical/seeders/seeders.module';
import { SignalModule } from './technical/signal/signal.module';
import { TenantMiddleware } from './technical/tenancy/tenant.middleware';
import { DomainExceptionFilter } from './technical/errors/domain-exception.filter';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    FeatureFlagsModule,
    JobsModule,
    MonitoringModule,
    NotificationsModule,
    SeedersModule.forRoot([WorkoutSeeder]),
    SignalModule,
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
  }
}
