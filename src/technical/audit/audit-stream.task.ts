import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { env } from '#technical/config/env';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { AUDIT_STREAM_TASK } from './audit-sink.constants';
import { AuditStreamService } from './audit-stream.service';

@Injectable()
export class AuditStreamTask {
  constructor(
    private readonly stream: AuditStreamService,
    private readonly store: ScheduledTaskStore,
  ) {}

  @Cron(`*/${env.AUDIT_STREAM_INTERVAL_SECONDS} * * * * *`, {
    name: AUDIT_STREAM_TASK,
  })
  async run(): Promise<void> {
    if (!env.AUDIT_STREAM_ENABLED) {
      return;
    }

    await this.store.run(AUDIT_STREAM_TASK, async () => {
      await this.stream.streamAll();
    });
  }
}
