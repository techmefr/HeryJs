import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TraceContextStorage } from '#technical/tracing/trace-context';
import { PipelineStore } from './pipeline.store';

// Opens the trace context outermost, before TenantMiddleware, so every
// downstream guard, interceptor, handler, and Prisma call made while
// resolving the request can attach a step to it. Never opened in
// production: an unopened context makes every pushStep() a no-op, so the
// instrumentation calls sprinkled through technical/ cost one getStore()
// check and keep no data in memory once traffic is real.
@Injectable()
export class PipelineMiddleware implements NestMiddleware {
  constructor(private readonly store: PipelineStore) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (process.env.NODE_ENV === 'production') {
      next();
      return;
    }

    const id = randomUUID();
    const start = process.hrtime.bigint();

    TraceContextStorage.run(() => {
      res.on('finish', () => {
        const steps = TraceContextStorage.getSteps();
        const blockedStepIndex = steps.findIndex(
          (step) => step.status !== 'ok',
        );

        this.store.record({
          id,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Number(process.hrtime.bigint() - start) / 1_000_000,
          timestamp: new Date().toISOString(),
          steps,
          blockedStepIndex: blockedStepIndex === -1 ? null : blockedStepIndex,
        });
      });

      next();
    });
  }
}
