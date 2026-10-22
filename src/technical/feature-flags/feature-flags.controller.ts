import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Capability } from '#technical/capabilities/capability.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { isPlatformOperator } from '#technical/capabilities/ability';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { SessionGuard } from '#technical/auth/session.guard';
import { ok } from '#technical/http/envelope';
import { okPage, parsePageQuery } from '#technical/http/page-query';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import {
  canEvaluateFeatureFlags,
  canManageFeatureFlags,
} from './feature-flags.policy';
import { FeatureFlagsService } from './feature-flags.service';
import {
  evaluateFeatureFlagSchema,
  setFeatureFlagSchema,
} from './set-feature-flag.dto';
import type {
  EvaluateFeatureFlagDto,
  SetFeatureFlagDto,
} from './set-feature-flag.dto';

@Controller('feature-flags')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class FeatureFlagsController {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  @RateLimit('read')
  @Get()
  @Capability(canManageFeatureFlags)
  async list(@Query() query: unknown) {
    const page = parsePageQuery(query);

    if (callerIsOperator()) {
      return okPage(await this.featureFlags.listAll(page), page);
    }

    return okPage(
      await this.featureFlags.listForTenant(
        TenantContextStorage.getTenantId(),
        page,
      ),
      page,
    );
  }

  /**
   * What would this user, tenant or plan get? Answers with the reason, so an
   * operator can see whether a rule, the percentage or the kill switch
   * decided. A preview only: it reads, it never writes.
   */
  @RateLimit('read')
  @Post('evaluate')
  @Capability(canEvaluateFeatureFlags)
  async evaluate(
    @Body(new ZodValidationPipe(evaluateFeatureFlagSchema))
    body: EvaluateFeatureFlagDto,
  ) {
    const { key, tenantId, ...context } = body;

    return ok(
      await this.featureFlags.evaluate(key, {
        ...context,
        tenantId: targetTenant(tenantId),
      }),
    );
  }

  @RateLimit('write')
  @Patch(':key')
  @Capability(canManageFeatureFlags)
  async set(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(setFeatureFlagSchema)) body: SetFeatureFlagDto,
  ) {
    const { tenantId, ...patch } = body;

    return ok(await this.featureFlags.set(key, patch, targetTenant(tenantId)));
  }

  @RateLimit('write')
  @Delete(':key')
  @Capability(canManageFeatureFlags)
  async remove(
    @Param('key') key: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const target = targetTenant(tenantId || undefined);

    if (!(await this.featureFlags.remove(key, target))) {
      throw new NotFoundException('Feature flag not found');
    }

    return ok({ key, tenantId: target ?? null });
  }
}

function callerIsOperator(): boolean {
  return isPlatformOperator(TenantContextStorage.getUserId());
}

/**
 * The tenant a flag write or preview applies to. The operator names any
 * tenant, or none for a global flag. A tenant admin always gets its own:
 * omitting the tenant means its own, naming another tenant or asking for the
 * global flag (null) is refused rather than silently redirected.
 */
function targetTenant(
  requested: string | null | undefined,
): string | undefined {
  if (callerIsOperator()) {
    return requested ?? undefined;
  }

  const own = TenantContextStorage.getTenantId();

  if (requested === undefined || requested === own) {
    return own;
  }

  throw new ForbiddenException('featureFlags.operatorOnly');
}
