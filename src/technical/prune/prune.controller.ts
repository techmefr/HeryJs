import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Capability } from '#technical/capabilities/capability.decorator';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { SessionGuard } from '#technical/auth/session.guard';
import { ok } from '#technical/http/envelope';
import { canManagePrune } from './prune.policy';
import { PruneService } from './prune.service';

// Not DevOnlyGuard-gated like the scheduler's own controller -- an admin
// needs to see and trigger this in production, which is the entire point
// of the lock/manual-trigger split.
//
// status() is a POST, not the plain GET a read-only status endpoint would
// suggest, for the same reason search is: the admin panel auto-discovers any
// argument-free GET as its own sidebar section, and this data already has a
// dedicated page (prune.astro) -- see admin/src/lib/api.ts's sectionsOf.
@Controller('prune')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class PruneController {
  constructor(private readonly prune: PruneService) {}

  @Post('status')
  @HttpCode(200)
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
