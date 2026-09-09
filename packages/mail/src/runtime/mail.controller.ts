import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#kernel/auth/session.guard';
import { RateLimit } from '#kernel/rate-limit/rate-limit.decorator';
import { CapabilitiesGuard } from '#kernel/capabilities/capabilities.guard';
import { Capability } from '#kernel/capabilities/capability.decorator';
import { okPage, parsePageQuery } from '#kernel/http/page-query';
import { TenantContextStorage } from '#kernel/tenancy/tenant-context';
import { canReadMailLog } from './mail.policy';
import { MailService } from './mail.service';

@Controller('mail')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class MailController {
  constructor(private readonly mail: MailService) {}

  @RateLimit('read')
  @Get()
  @Capability(canReadMailLog)
  async list(@Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(
      await this.mail.list(TenantContextStorage.getTenantId(), page),
      page,
    );
  }
}
