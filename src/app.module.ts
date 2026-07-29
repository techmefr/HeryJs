import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WorkoutModule } from './functional/workout/workout.module';
import { AuthModule } from './technical/auth/auth.module';
import { JobsModule } from './technical/jobs/jobs.module';
import { SignalModule } from './technical/signal/signal.module';
import { TenantMiddleware } from './technical/tenancy/tenant.middleware';
import { DomainExceptionFilter } from './technical/errors/domain-exception.filter';

@Module({
  imports: [AuthModule, JobsModule, SignalModule, WorkoutModule],
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
