import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { DevOnlyGuard } from '../dev-only/dev-only.guard';
import { ok } from '../http/envelope';
import { InspectorStore } from './inspector.store';

@Controller('inspector')
@UseGuards(SessionGuard, DevOnlyGuard)
export class InspectorController {
  constructor(private readonly store: InspectorStore) {}

  @Get('requests')
  list() {
    return ok(this.store.list());
  }
}
