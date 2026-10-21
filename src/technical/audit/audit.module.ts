import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { env } from '#technical/config/env';
import { DriversModule } from '#technical/drivers/drivers.module';
import { OutboxModule } from '#technical/outbox/outbox.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditSinkController } from './audit-sink.controller';
import { AUDIT_SINK_OPTIONS, AuditSinkDelivery } from './audit-sink.delivery';
import { AuditSinkHandler } from './audit-sink.handler';
import { AuditSinkService } from './audit-sink.service';
import { AuditStreamService } from './audit-stream.service';
import { AuditStreamTask } from './audit-stream.task';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    DriversModule,
    OutboxModule,
    SchedulerModule,
  ],
  controllers: [AuditController, AuditSinkController],
  providers: [
    AuditService,
    AuditSinkService,
    AuditSinkDelivery,
    AuditSinkHandler,
    AuditStreamService,
    AuditStreamTask,
    {
      provide: AUDIT_SINK_OPTIONS,
      useFactory: () => ({
        allowPrivateHosts: env.AUDIT_SINK_ALLOW_PRIVATE_HOSTS,
      }),
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
