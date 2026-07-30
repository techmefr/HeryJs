import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { DevOnlyGuard } from '../dev-only/dev-only.guard';
import { ok } from '../http/envelope';
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
