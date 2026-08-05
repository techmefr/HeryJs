import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { DevOnlyGuard } from '#technical/dev-only/dev-only.guard';
import { ok } from '#technical/http/envelope';
import { IntrospectionService } from './introspection.service';

@Controller('introspect')
@UseGuards(SessionGuard, DevOnlyGuard)
export class IntrospectionController {
  constructor(private readonly introspection: IntrospectionService) {}

  @Get()
  list() {
    return ok(this.introspection.all());
  }
}
