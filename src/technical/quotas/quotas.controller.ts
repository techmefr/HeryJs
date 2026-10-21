import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { okPage, parsePageQuery } from '#technical/http/page-query';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import {
  canReadQuotas,
  canReadTenantQuotas,
  canResetQuota,
  canSetQuotaOverride,
} from './quotas.policy';
import { QuotasService } from './quotas.service';
import {
  resetQuotaSchema,
  setQuotaOverrideSchema,
} from './set-quota-override.dto';
import type {
  ResetQuotaDto,
  SetQuotaOverrideDto,
} from './set-quota-override.dto';

@Controller('quotas')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class QuotasController {
  constructor(private readonly quotas: QuotasService) {}

  @UnpaginatedRoute(
    'one row per quota the project declares in hery.config.ts, a list the code itself bounds',
  )
  @RateLimit('read')
  @Get()
  @Capability(canReadQuotas)
  async usage() {
    return ok(await this.quotas.usage());
  }

  @UnpaginatedRoute(
    'one row per quota the project declares in hery.config.ts, a list the code itself bounds',
  )
  @RateLimit('read')
  @Get('defaults')
  @Capability(canReadQuotas)
  defaults() {
    return ok(this.quotas.defaults());
  }

  @RateLimit('read')
  @Get('tenants')
  @Capability(canReadTenantQuotas)
  async tenants(@Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(await this.quotas.tenantsUsage(page), page);
  }

  @RateLimit('write')
  @Put(':name/override')
  @Capability(canSetQuotaOverride)
  async setOverride(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(setQuotaOverrideSchema))
    body: SetQuotaOverrideDto,
  ) {
    await this.quotas.setOverride(body.tenantId, name, body.limit);

    return ok({ name, tenantId: body.tenantId, limit: body.limit });
  }

  @RateLimit('write')
  @Post(':name/reset')
  @Capability(canResetQuota)
  async reset(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(resetQuotaSchema)) body: ResetQuotaDto,
  ) {
    await this.quotas.resetUsage(body.tenantId, name);

    return ok({ name, tenantId: body.tenantId });
  }
}
