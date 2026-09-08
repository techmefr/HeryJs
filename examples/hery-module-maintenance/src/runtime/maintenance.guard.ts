import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { RequestWithUser } from '#kernel/auth/session.guard';
import { MaintenanceException } from './maintenance.exception';

/**
 * The flag is read per request rather than at import time: a module read once
 * at boot cannot be turned off without a restart, and the guard costs one
 * property read either way.
 *
 * Only the exact string 'true' turns it on, which is the kernel's own reading
 * of a boolean environment variable -- so MAINTENANCE_ENABLED=1 leaves the app
 * up rather than half-closing it.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.MAINTENANCE_ENABLED !== 'true') {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (request.user?.role === 'admin') {
      return true;
    }

    throw new MaintenanceException();
  }
}
