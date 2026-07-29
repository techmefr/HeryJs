import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { TenantContextStorage } from '../tenancy/tenant-context';
import { ok } from '../http/envelope';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { FeatureFlagsService } from './feature-flags.service';
import { setFeatureFlagSchema } from './set-feature-flag.dto';
import type { SetFeatureFlagDto } from './set-feature-flag.dto';

@Controller('feature-flags')
@UseGuards(SessionGuard)
export class FeatureFlagsController {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  @Get()
  async list() {
    return ok(await this.featureFlags.list(TenantContextStorage.getTenantId()));
  }

  @Patch(':key')
  async set(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(setFeatureFlagSchema)) body: SetFeatureFlagDto,
  ) {
    const tenantId =
      body.scope === 'tenant' ? TenantContextStorage.getTenantId() : undefined;

    return ok(await this.featureFlags.set(key, body.enabled, tenantId));
  }
}
