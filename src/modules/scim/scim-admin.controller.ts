import {
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AdminAction,
  AdminSection,
  ok,
  okPage,
  parsePageQuery,
  RateLimit,
  UnpaginatedRoute,
} from '#technical/public/http';
import { type RequestWithUser, SessionGuard } from '#technical/public/auth';
import { CapabilitiesGuard, Capability } from '#technical/public/capabilities';
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

  @AdminSection({
    id: 'scim-token',
    title: 'SCIM token',
    icon: 'key',
    group: 'Identity',
    columns: [
      { key: 'isConfigured', label: 'Configured', format: 'boolean' },
      { key: 'prefix', label: 'Prefix' },
      { key: 'rotatedAt', label: 'Rotated', format: 'date' },
      { key: 'lastUsedAt', label: 'Last used', format: 'date' },
    ],
  })
  @UnpaginatedRoute('one token status per tenant')
  @RateLimit('read')
  @Get('token')
  @Capability(canManageScim)
  async status(@Req() req: RequestWithUser) {
    return ok(await this.tokens.status(req.user.tenantId));
  }

  @AdminAction({
    id: 'scim-token-issue',
    title: 'Issue or rotate token',
    icon: 'key',
    section: 'scim-token',
    scope: 'global',
    confirm:
      'Issue a new SCIM token? The previous one stops working and the new one is shown once.',
  })
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

  @AdminAction({
    id: 'scim-token-revoke',
    title: 'Revoke token',
    icon: 'key',
    section: 'scim-token',
    scope: 'global',
    danger: true,
    confirm: 'Revoke the SCIM token? The directory stops provisioning.',
  })
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

  @AdminSection({
    id: 'scim-activity',
    title: 'SCIM activity',
    icon: 'activity',
    group: 'Identity',
    columns: [
      { key: 'at', label: 'When', format: 'date' },
      { key: 'resource', label: 'Resource', format: 'badge' },
      { key: 'action', label: 'Action', format: 'badge' },
      { key: 'detail', label: 'Detail' },
    ],
  })
  @RateLimit('read')
  @Get('activity')
  @Capability(canManageScim)
  async history(@Req() req: RequestWithUser, @Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(await this.activity.page(req.user.tenantId, page), page);
  }
}
