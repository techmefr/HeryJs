import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { okPage, parsePageQuery } from '#technical/http/page-query';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { AdminAction, AdminSection } from './admin-metadata';
import { AdminStudio } from './admin-studio.guard';
import { canManageTenantAccess } from './studio.policy';
import { TenantAccessService } from './tenant-access.service';

/**
 * Users, sessions and API keys of the caller's tenant, so an operator can see
 * who has access and cut it off without a SQL client. Impersonation stays on
 * its own `/impersonation` route: it hands back a bearer token, which an admin
 * button has nowhere safe to put.
 */
@Controller('studio/access')
@AdminStudio()
export class TenantAccessController {
  constructor(private readonly access: TenantAccessService) {}

  @RateLimit('read')
  @AdminSection({
    id: 'studio-users',
    title: 'Users',
    icon: 'users',
    group: 'Users and access',
    order: 1,
    columns: [
      { key: 'email', label: 'Email' },
      { key: 'name', label: 'Name' },
      { key: 'role', label: 'Role', format: 'badge' },
      { key: 'emailVerified', label: 'Verified', format: 'boolean' },
      { key: 'twoFactorEnabled', label: '2FA', format: 'boolean' },
      { key: 'banned', label: 'Banned', format: 'boolean' },
      { key: 'activeSessions', label: 'Sessions', format: 'number' },
      { key: 'activeApiKeys', label: 'API keys', format: 'number' },
      { key: 'createdAt', label: 'Joined', format: 'date' },
    ],
  })
  @Get('users')
  @Capability(canManageTenantAccess)
  async users(@Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(
      await this.access.users(TenantContextStorage.getTenantId(), page),
      page,
    );
  }

  @RateLimit('write')
  @AdminAction({
    id: 'studio-user-sign-out',
    title: 'Sign out everywhere',
    icon: 'shield',
    section: 'studio-users',
    scope: 'row',
    confirm:
      'Every session of this user ends now; their API keys keep working.',
    danger: true,
  })
  @Post('users/:id/sign-out')
  @Capability(canManageTenantAccess)
  async signOutUser(@Param('id') id: string) {
    const revoked = await this.access.signOutUser(
      TenantContextStorage.getTenantId(),
      id,
    );

    return ok({ revoked }, ['Every session of this user was signed out.']);
  }

  @RateLimit('read')
  @AdminSection({
    id: 'studio-sessions',
    title: 'Sessions',
    icon: 'clock',
    group: 'Users and access',
    order: 2,
    columns: [
      { key: 'userEmail', label: 'User' },
      { key: 'ipAddress', label: 'IP' },
      { key: 'userAgent', label: 'Agent' },
      { key: 'impersonated', label: 'Impersonated', format: 'boolean' },
      { key: 'createdAt', label: 'Started', format: 'date' },
      { key: 'expiresAt', label: 'Expires', format: 'date' },
      { key: 'userId', label: 'User id', hidden: true },
    ],
  })
  @Get('sessions')
  @Capability(canManageTenantAccess)
  async sessions(@Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(
      await this.access.sessions(TenantContextStorage.getTenantId(), page),
      page,
    );
  }

  @RateLimit('write')
  @AdminAction({
    id: 'studio-session-revoke',
    title: 'Revoke session',
    icon: 'shield',
    section: 'studio-sessions',
    scope: 'row',
    confirm: 'This session is signed out now.',
    danger: true,
  })
  @Post('sessions/:id/revoke')
  @Capability(canManageTenantAccess)
  async revokeSession(@Param('id') id: string) {
    await this.access.revokeSession(TenantContextStorage.getTenantId(), id);

    return ok(null, ['Session signed out.']);
  }

  @RateLimit('read')
  @AdminSection({
    id: 'studio-api-keys',
    title: 'API keys',
    icon: 'key',
    group: 'Users and access',
    order: 3,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'userEmail', label: 'Owner' },
      { key: 'createdAt', label: 'Created', format: 'date' },
      { key: 'revokedAt', label: 'Revoked', format: 'date' },
      { key: 'userId', label: 'Owner id', hidden: true },
    ],
  })
  @Get('api-keys')
  @Capability(canManageTenantAccess)
  async apiKeys(@Query() query: unknown) {
    const page = parsePageQuery(query);

    return okPage(
      await this.access.apiKeys(TenantContextStorage.getTenantId(), page),
      page,
    );
  }

  @RateLimit('write')
  @AdminAction({
    id: 'studio-api-key-revoke',
    title: 'Revoke key',
    icon: 'key',
    section: 'studio-api-keys',
    scope: 'row',
    confirm: 'Every caller using this key is refused from now on.',
    danger: true,
  })
  @Post('api-keys/:id/revoke')
  @Capability(canManageTenantAccess)
  async revokeApiKey(@Param('id') id: string) {
    await this.access.revokeApiKey(TenantContextStorage.getTenantId(), id);

    return ok(null, ['API key revoked.']);
  }
}
