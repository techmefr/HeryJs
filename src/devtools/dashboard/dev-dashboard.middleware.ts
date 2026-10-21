import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TelemetryBus } from '#technical/tracing/telemetry-bus';
import { DEV_DASHBOARD_SETTINGS } from './dev-dashboard.settings';
import type { DevDashboardSettings } from './dev-dashboard.settings';

export const DEV_DASHBOARD_BASE_PATH = '/devtools';

/**
 * Opens the request's telemetry scope outermost, so every statement the
 * request runs is attributed to it and the N+1 verdict can be reached per
 * request. The dashboard's own routes are muted instead: reading the dashboard
 * must not write to it, or every refresh would be the newest thing on the page.
 */
@Injectable()
export class DevDashboardMiddleware implements NestMiddleware {
  constructor(
    @Inject(DEV_DASHBOARD_SETTINGS)
    private readonly settings: DevDashboardSettings,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    if (!this.settings.isEnabled) {
      next();
      return;
    }

    const path = req.originalUrl.split('?')[0] ?? '';

    if (
      path === DEV_DASHBOARD_BASE_PATH ||
      path.startsWith(`${DEV_DASHBOARD_BASE_PATH}/`)
    ) {
      TelemetryBus.runMuted(() => next());
      return;
    }

    TelemetryBus.runInRequest(randomUUID(), () => next());
  }
}
