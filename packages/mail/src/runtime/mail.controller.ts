import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#kernel/auth/session.guard';
import { CapabilitiesGuard } from '#kernel/capabilities/capabilities.guard';
import { Capability } from '#kernel/capabilities/capability.decorator';
import { ok } from '#kernel/http/envelope';
import { TenantContextStorage } from '#kernel/tenancy/tenant-context';
import { canReadMailLog } from './mail.policy';
import { MailService } from './mail.service';

@Controller('mail')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get()
  @Capability(canReadMailLog)
  async list() {
    return ok(await this.mail.list(TenantContextStorage.getTenantId()));
  }
}
