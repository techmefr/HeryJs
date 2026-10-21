import { Controller, Delete, Get, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { okPage } from '#technical/http/page-query';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { DevDashboardEnabledGuard } from './dev-dashboard.guard';
import { canUseDevDashboard } from './dev-dashboard.policy';
import {
  DevDashboardService,
  parseDashboardQuery,
} from './dev-dashboard.service';

@Controller('devtools')
@UseGuards(SessionGuard, DevDashboardEnabledGuard, CapabilitiesGuard)
export class DevDashboardController {
  constructor(private readonly dashboard: DevDashboardService) {}

  @RateLimit('read')
  @Get('entries')
  @Capability(canUseDevDashboard)
  async list(@Query() query: unknown) {
    const parsed = parseDashboardQuery(query);

    return okPage(
      await this.dashboard.list(TenantContextStorage.getTenantId(), parsed),
      parsed.page,
    );
  }

  @UnpaginatedRoute(
    'one count per entry kind, a closed list of eight, not rows that grow',
  )
  @RateLimit('read')
  @Get('summary')
  @Capability(canUseDevDashboard)
  async summary() {
    return ok(await this.dashboard.summary(TenantContextStorage.getTenantId()));
  }

  @RateLimit('write')
  @Delete('entries')
  @Capability(canUseDevDashboard)
  async clear() {
    return ok({
      deleted: await this.dashboard.clear(TenantContextStorage.getTenantId()),
    });
  }
}
