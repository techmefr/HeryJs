import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { tap } from 'rxjs';
import { httpRequestDuration, httpRequestsTotal } from './metrics.registry';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap(() => {
        const durationSeconds =
          Number(process.hrtime.bigint() - start) / 1_000_000_000;
        const route = request.route as { path?: string } | undefined;
        const labels = {
          method: request.method,
          route: route?.path ?? request.path,
          status: String(response.statusCode),
        };

        httpRequestsTotal.inc(labels);
        httpRequestDuration.observe(labels, durationSeconds);
      }),
    );
  }
}
