import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { DevOnlyGuard } from '#technical/dev-only/dev-only.guard';
import { ok } from '#technical/http/envelope';
import { ScheduledTaskStore } from './scheduled-task.store';

@Controller('scheduler')
@UseGuards(SessionGuard, DevOnlyGuard)
export class SchedulerController {
  constructor(private readonly store: ScheduledTaskStore) {}

  @Get('tasks')
  list() {
    return ok(this.store.list());
  }
}
