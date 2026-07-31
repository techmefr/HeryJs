import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { ok } from '#technical/http/envelope';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(SessionGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list() {
    return ok(await this.audit.list(TenantContextStorage.getTenantId()));
  }

  @Get('verify')
  async verify() {
    const valid = await this.audit.verifyChain(
      TenantContextStorage.getTenantId(),
    );
    return ok({ valid });
  }
}
