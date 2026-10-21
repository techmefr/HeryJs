import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { canReadQuotas, canSetQuotaOverride } from './quotas.policy';
import { QuotasService } from './quotas.service';
import { setQuotaOverrideSchema } from './set-quota-override.dto';
import type { SetQuotaOverrideDto } from './set-quota-override.dto';

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
}
