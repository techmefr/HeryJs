import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { DevOnlyGuard } from '#technical/dev-only/dev-only.guard';
import { canUseDevtools } from '#technical/dev-only/dev-only.policy';
import { ok } from '#technical/http/envelope';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { IntrospectionService } from './introspection.service';

@Controller('introspect')
@UseGuards(SessionGuard, DevOnlyGuard, CapabilitiesGuard)
export class IntrospectionController {
  constructor(private readonly introspection: IntrospectionService) {}

  @UnpaginatedRoute(
    'the route table this application declares in code, as long as that code',
  )
  @Get()
  @Capability(canUseDevtools)
  list() {
    return ok(this.introspection.all());
  }
}
