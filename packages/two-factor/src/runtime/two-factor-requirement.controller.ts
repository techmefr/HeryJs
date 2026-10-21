import {
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CapabilitiesGuard } from '#kernel/capabilities/capabilities.guard';
import { Capability } from '#kernel/capabilities/capability.decorator';
import { RateLimit } from '#kernel/rate-limit/rate-limit.decorator';
import { SessionGuard } from '#kernel/auth/session.guard';
import type { RequestWithUser } from '#kernel/auth/session.guard';
import { ok } from '#kernel/http/envelope';
import { okPage, parsePageQuery } from '#kernel/http/page-query';
import { ZodValidationPipe } from '#kernel/validation/zod-validation.pipe';
import { canManageTwoFactorRequirements } from './two-factor.policy';
import { roleParamSchema } from './two-factor.schemas';
import { TwoFactorRequirementService } from './two-factor-requirement.service';

@Controller('two-factor/requirements')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class TwoFactorRequirementController {
  constructor(private readonly requirements: TwoFactorRequirementService) {}

  @RateLimit('read')
  @Get()
  @Capability(canManageTwoFactorRequirements)
  async list(@Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(await this.requirements.list(page), page);
  }

  @RateLimit('write')
  @Put(':role')
  @Capability(canManageTwoFactorRequirements)
  async require(
    @Req() req: RequestWithUser,
    @Param(new ZodValidationPipe(roleParamSchema)) params: { role: string },
  ) {
    await this.requirements.require(req.user.tenantId, params.role);

    return ok({ role: params.role }, [
      'Two-factor is now required for this role.',
    ]);
  }

  @RateLimit('write')
  @Delete(':role')
  @Capability(canManageTwoFactorRequirements)
  async release(
    @Param(new ZodValidationPipe(roleParamSchema)) params: { role: string },
  ) {
    await this.requirements.release(params.role);

    return ok(null, ['Two-factor is no longer required for this role.']);
  }
}
