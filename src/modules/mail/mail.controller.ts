import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { okPage, parsePageQuery } from '#technical/http/page-query';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { canReadMailLog } from './mail.policy';
import { MailService } from './mail.service';

@Controller('mail')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class MailController {
  constructor(private readonly mail: MailService) {}

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
