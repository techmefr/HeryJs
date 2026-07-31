import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { ok } from '#technical/http/envelope';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { MailService } from './mail.service';

@Controller('mail')
@UseGuards(SessionGuard)
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get()
  async list() {
    return ok(await this.mail.list(TenantContextStorage.getTenantId()));
  }
}
