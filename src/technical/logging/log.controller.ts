import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { okPage } from '#technical/http/page-query';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { canReadLogs } from './log.policy';
import { LogService, parseLogQuery } from './log.service';

@Controller('logs')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class LogController {
  constructor(private readonly logs: LogService) {}

  @RateLimit('read')
  @Get()
  @Capability(canReadLogs)
  async list(@Query() query: unknown) {
    const parsed = parseLogQuery(query);

    return okPage(
      await this.logs.query(TenantContextStorage.getTenantId(), parsed),
      parsed.page,
    );
  }
}
