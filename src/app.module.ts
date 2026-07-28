import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WorkoutModule } from './functional/workout/workout.module';
import { AuthModule } from './technical/auth/auth.module';
import { TenantMiddleware } from './technical/tenancy/tenant.middleware';

@Module({
  imports: [AuthModule, WorkoutModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
