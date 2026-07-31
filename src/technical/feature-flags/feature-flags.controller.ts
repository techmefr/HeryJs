import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import { ok } from '#technical/http/envelope';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { FeatureFlagsService } from './feature-flags.service';
import { setFeatureFlagSchema } from './set-feature-flag.dto';
import type { SetFeatureFlagDto } from './set-feature-flag.dto';

@Controller('feature-flags')
@UseGuards(SessionGuard)
export class FeatureFlagsController {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  @Get()
  async list() {
    return ok(await this.featureFlags.listAll());
  }

  @Patch(':key')
  async set(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(setFeatureFlagSchema)) body: SetFeatureFlagDto,
  ) {
    return ok(
      await this.featureFlags.set(
        key,
        body.enabled,
        body.tenantId ?? undefined,
      ),
    );
  }
}
