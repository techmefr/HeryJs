import { Injectable, NestMiddleware } from '@nestjs/common';
import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  trace,
} from '@opentelemetry/api';
import type { NextFunction, Request, Response } from 'express';
import { isTelemetryEnabled } from './telemetry-config';

const TRACER_NAME = 'heryjs';
const SERVER_ERROR_FLOOR = 500;
const UNMATCHED_ROUTE = 'unmatched';

@Injectable()
export class TelemetryMiddleware implements NestMiddleware {
  private readonly isActive = isTelemetryEnabled();

  use(req: Request, res: Response, next: NextFunction): void {
    if (!this.isActive) {
      next();
      return;
    }

    const path = req.originalUrl.split('?')[0]!;
    const parent = propagation.extract(ROOT_CONTEXT, req.headers);

    const span = trace.getTracer(TRACER_NAME).startSpan(
      `${req.method} ${path}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.request.method': req.method,
          'url.path': path,
        },
      },
      parent,
    );

    res.on('finish', () => {
      const route = (req.route as { path?: string } | undefined)?.path;

      span.updateName(`${req.method} ${route ?? UNMATCHED_ROUTE}`);
      span.setAttribute('http.route', route ?? UNMATCHED_ROUTE);
      span.setAttribute('http.response.status_code', res.statusCode);

      if (res.statusCode >= SERVER_ERROR_FLOOR) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }

      span.end();
    });

    context.with(trace.setSpan(parent, span), next);
  }
}
