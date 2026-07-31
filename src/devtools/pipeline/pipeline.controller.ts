import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { DevOnlyGuard } from '#technical/dev-only/dev-only.guard';
import { ok } from '#technical/http/envelope';
import { PipelineStore } from './pipeline.store';

@Controller('pipeline')
@UseGuards(SessionGuard, DevOnlyGuard)
export class PipelineController {
  constructor(private readonly store: PipelineStore) {}

  @Get('traces')
  list() {
    return ok(this.store.list());
  }
}
