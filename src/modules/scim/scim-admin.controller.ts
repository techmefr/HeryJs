import {
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { okPage, parsePageQuery } from '#technical/http/page-query';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { ScimActivityService } from './scim-activity.service';
import { ScimTokenService } from './scim-token.service';
import { canManageScim } from './scim.policy';

@Controller('scim')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class ScimAdminController {
  constructor(
    private readonly tokens: ScimTokenService,
    private readonly activity: ScimActivityService,
  ) {}

  @UnpaginatedRoute('one token status per tenant')
  @RateLimit('read')
  @Get('token')
  @Capability(canManageScim)
  async status(@Req() req: RequestWithUser) {
    return ok(await this.tokens.status(req.user.tenantId));
  }

  @RateLimit('write')
  @Post('token')
  @Capability(canManageScim)
  async issue(@Req() req: RequestWithUser) {
    const issued = await this.tokens.issue(req.user.tenantId);

    await this.activity.record(req.user.tenantId, {
      resource: 'token',
      action: issued.status.rotatedAt ? 'rotated' : 'issued',
      resourceId: null,
    });

    return ok(issued, [
      'SCIM token issued. Copy it now: it is not shown again, and any previous token stopped working.',
    ]);
  }

  @RateLimit('write')
  @Delete('token')
  @Capability(canManageScim)
  async revoke(@Req() req: RequestWithUser) {
    const revoked = await this.tokens.revoke(req.user.tenantId);

    if (revoked) {
      await this.activity.record(req.user.tenantId, {
        resource: 'token',
        action: 'revoked',
        resourceId: null,
      });
    }

    return ok(null, [
      revoked ? 'SCIM token revoked.' : 'No SCIM token was set.',
    ]);
  }

  @RateLimit('read')
  @Get('activity')
  @Capability(canManageScim)
  async history(@Req() req: RequestWithUser, @Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(await this.activity.page(req.user.tenantId, page), page);
  }
}
