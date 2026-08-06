import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { DevOnlyGuard } from '#technical/dev-only/dev-only.guard';
import { canUseDevtools } from '#technical/dev-only/dev-only.policy';
import { ok } from '#technical/http/envelope';
import { PipelineStore } from './pipeline.store';

@Controller('pipeline')
@UseGuards(SessionGuard, DevOnlyGuard, CapabilitiesGuard)
export class PipelineController {
  constructor(private readonly store: PipelineStore) {}

  @Get('traces')
  @Capability(canUseDevtools)
  list() {
    return ok(this.store.list());
  }
}
