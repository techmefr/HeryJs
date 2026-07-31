import { Controller, Get, UseGuards } from '@nestjs/common';
import { Capability } from '#technical/capabilities/capability.decorator';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { SessionGuard } from '#technical/auth/session.guard';
import { ok } from '#technical/http/envelope';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { canReadAuditLog } from './audit.policy';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Capability(canReadAuditLog)
  async list() {
    return ok(await this.audit.list(TenantContextStorage.getTenantId()));
  }

  @Get('verify')
  @Capability(canReadAuditLog)
  async verify() {
    const valid = await this.audit.verifyChain(
      TenantContextStorage.getTenantId(),
    );
    return ok({ valid });
  }
}
