import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { DevOnlyGuard } from '#technical/dev-only/dev-only.guard';
import { canUseDevtools } from '#technical/dev-only/dev-only.policy';
import { ok } from '#technical/http/envelope';
import { ScheduledTaskStore } from './scheduled-task.store';

@Controller('scheduler')
@UseGuards(SessionGuard, DevOnlyGuard, CapabilitiesGuard)
export class SchedulerController {
  constructor(private readonly store: ScheduledTaskStore) {}

  @Get('tasks')
  @Capability(canUseDevtools)
  list() {
    return ok(this.store.list());
  }
}
