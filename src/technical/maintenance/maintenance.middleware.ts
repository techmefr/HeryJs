import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { renderErrorPage } from '#technical/errors/error-page';
import { MaintenanceStore } from './maintenance-store';
import { MAINTENANCE_BYPASS_HEADER, isBypassSecret } from './maintenance-state';

const HEALTH_PATHS = new Set(['/health', '/health/live', '/health/ready']);
const SERVICE_UNAVAILABLE = 503;
const DEFAULT_MESSAGE = 'Down for maintenance. Please try again shortly.';

function isHealthProbe(url: string): boolean {
  const path = url.split('?')[0]!;
  return HEALTH_PATHS.has(path.length > 1 ? path.replace(/\/$/, '') : path);
}

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(private readonly store: MaintenanceStore) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const state = await this.store.current();

    if (state === null || isHealthProbe(req.originalUrl)) {
      next();
      return;
    }

    if (isBypassSecret(state, req.header(MAINTENANCE_BYPASS_HEADER))) {
      next();
      return;
    }

    const message = state.message ?? DEFAULT_MESSAGE;

    res.setHeader('Retry-After', String(state.retryAfterSeconds));

    if (req.headers.accept?.includes('text/html')) {
      res
        .status(SERVICE_UNAVAILABLE)
        .type('html')
        .send(renderErrorPage(SERVICE_UNAVAILABLE, message));
      return;
    }

    res.status(SERVICE_UNAVAILABLE).json({
      error: {
        status: SERVICE_UNAVAILABLE,
        key: 'maintenance.active',
        message,
        details: { retryAfterSeconds: state.retryAfterSeconds },
      },
    });
  }
}
