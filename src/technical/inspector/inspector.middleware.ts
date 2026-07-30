import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContextStorage } from '../tenancy/tenant-context';
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

    res.on('finish', () => {
      this.store.record({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - start) / 1_000_000,
        tenantId: currentTenantId(),
        timestamp: new Date().toISOString(),
      });
    });

    next();
  }
}
