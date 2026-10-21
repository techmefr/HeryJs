import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import type { Request } from 'express';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { SessionGuard } from '#technical/auth/session.guard';
import type { RequestWithUser } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { adminStudioSettings, normalizeIp } from './admin-settings';

/**
 * The outer door, ahead of authentication on purpose. In production the
 * studio does not exist unless an operator opted in, and a caller outside the
 * allowed addresses is told the same thing, so neither a missing switch nor a
 * wrong network says "this is here". Outside production it lets everything
 * through: the development behaviour is the unchanged one.
 *
 * Nothing the request carries can switch it off -- no header, no query
 * parameter -- and the only inputs are the process environment and the peer
 * address Express resolved, which honours `trust proxy` and nothing else.
 */
@Injectable()
export class AdminStudioGateGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const settings = adminStudioSettings();

    if (!settings.production) {
      return true;
    }

    if (!settings.enabled) {
      throw new NotFoundException();
    }

    if (settings.allowedIps.length > 0) {
      const request = context.switchToHttp().getRequest<Request>();

      if (!settings.allowedIps.includes(normalizeIp(request.ip))) {
        throw new NotFoundException();
      }
    }

    return true;
  }
}

/**
 * After authentication: when the operator asked for it, a production admin
 * must have a second factor enrolled. It reads the user row rather than
 * trusting the session, because the factor can be removed after sign-in.
 */
@Injectable()
export class AdminStudioFactorGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const settings = adminStudioSettings();

    if (!settings.production || !settings.requireTwoFactor) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    const row = await authPrismaClient.user.findUnique({
      where: { id: user.id },
      select: { twoFactorEnabled: true },
    });

    if (row?.twoFactorEnabled !== true) {
      throw new ForbiddenException('admin.twoFactorRequired');
    }

    return true;
  }
}

/**
 * The guard chain of a studio route, in the one order that is safe: gate,
 * session, second factor, capability. A controller that uses it still states
 * a `@Capability` per route; this decorator is only the production door.
 */
export const AdminStudio = () =>
  applyDecorators(
    UseGuards(
      AdminStudioGateGuard,
      SessionGuard,
      AdminStudioFactorGuard,
      CapabilitiesGuard,
    ),
  );
