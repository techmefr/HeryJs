import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TelemetryBus } from '#technical/tracing/telemetry-bus';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { InspectorStore } from './inspector.store';

function currentTenantId(): string | undefined {
  try {
    return TenantContextStorage.getTenantId();
  } catch {
    return undefined;
  }
}

@Injectable()
export class InspectorMiddleware implements NestMiddleware {
  constructor(private readonly store: InspectorStore) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    const requestId = TelemetryBus.currentRequestId();
    const tenantId = TenantContextStorage.findTenantId();
    const isMuted = TelemetryBus.isMuted();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

      if (!isMuted) {
        TelemetryBus.emit(
          {
            kind: 'request',
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs,
          },
          { tenantId, requestId },
        );
      }

      this.store.record({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
        tenantId: currentTenantId(),
        timestamp: new Date().toISOString(),
      });
    });

    next();
  }
}
