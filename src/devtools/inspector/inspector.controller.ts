import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../technical/auth/session.guard';
import { DevOnlyGuard } from '../../technical/dev-only/dev-only.guard';
import { ok } from '../../technical/http/envelope';
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
