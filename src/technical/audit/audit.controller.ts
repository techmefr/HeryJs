import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Capability } from '#technical/capabilities/capability.decorator';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { SessionGuard } from '#technical/auth/session.guard';
import { ok } from '#technical/http/envelope';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { okPage, parsePageQuery } from '#technical/http/page-query';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { canReadAuditLog } from './audit.policy';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Capability(canReadAuditLog)
  async list(@Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(
      await this.audit.page(TenantContextStorage.getTenantId(), page),
      page,
    );
  }

  @UnpaginatedRoute('one verdict on the whole chain, not a collection')
  @Get('verify')
  @Capability(canReadAuditLog)
  async verify() {
    const valid = await this.audit.verifyChain(
      TenantContextStorage.getTenantId(),
    );
    return ok({ valid });
  }
}
