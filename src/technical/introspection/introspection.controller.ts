import { Controller, Get } from '@nestjs/common';
import { AdminStudio } from '#technical/admin/admin-studio.guard';
import { canUseAdminStudio } from '#technical/admin/admin-studio.policy';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { IntrospectionService } from './introspection.service';

// The studio's own door rather than DevOnlyGuard: development keeps working as
// it did, and production is reachable by a platform admin once an operator has
// switched the studio on. See AdminStudio for the order of the guards.
@Controller('introspect')
@AdminStudio()
export class IntrospectionController {
  constructor(private readonly introspection: IntrospectionService) {}

  @UnpaginatedRoute(
    'the route table this application declares in code, as long as that code',
  )
  @RateLimit('read')
  @Get()
  @Capability(canUseAdminStudio)
  list() {
    return ok(this.introspection.all());
  }
}
