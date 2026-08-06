import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
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
