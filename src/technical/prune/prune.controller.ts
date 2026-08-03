import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Capability } from '#technical/capabilities/capability.decorator';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { SessionGuard } from '#technical/auth/session.guard';
import { ok } from '#technical/http/envelope';
import { canManagePrune } from './prune.policy';
import { PruneService } from './prune.service';

// Not DevOnlyGuard-gated like the scheduler's own controller -- an admin
// needs to see and trigger this in production, which is the entire point
// of the lock/manual-trigger split.
@Controller('prune')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class PruneController {
  constructor(private readonly prune: PruneService) {}

  @Get()
  @Capability(canManagePrune)
  status() {
    return ok(this.prune.status());
  }

  @Post(':model/run')
  @Capability(canManagePrune)
  async run(@Param('model') model: string) {
    return ok(await this.prune.pruneNow(model));
  }
}
