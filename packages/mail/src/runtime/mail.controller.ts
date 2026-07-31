import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#kernel/auth/session.guard';
import { ok } from '#kernel/http/envelope';
import { TenantContextStorage } from '#kernel/tenancy/tenant-context';
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
