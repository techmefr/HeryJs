import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { catchError, tap, throwError } from 'rxjs';
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

    const record = (status: number) => {
      const durationSeconds =
        Number(process.hrtime.bigint() - start) / 1_000_000_000;
      const route = request.route as { path?: string } | undefined;
      const labels = {
        method: request.method,
        // Never the raw URL: a route pattern is one label value per endpoint,
        // while a path is one per id -- and one per made-up path a scanner
        // tries, which is an unbounded label set anybody on the internet can
        // grow until the registry, and the scrape, fall over.
        route: route?.path ?? 'unmatched',
        status: String(status),
      };

      httpRequestsTotal.inc(labels);
      httpRequestDuration.observe(labels, durationSeconds);
    };

    // tap()'s next callback never runs on the error path, so a request that
    // throws -- a guard's 401/403, a validation 400, an unhandled 500 -- used
    // to go uncounted and the error rate stayed structurally at zero.
    // finalize() runs on both paths but fires before the exception filter
    // (which sits outside this interceptor) has written the status onto
    // `response`, so reading response.statusCode there would just record
    // every error as the pre-filter default. The status has to be derived
    // from the exception itself instead, the same way the filter does.
    return next.handle().pipe(
      tap(() => record(response.statusCode)),
      catchError((error: unknown) => {
        record(
          error instanceof HttpException
            ? error.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR,
        );
        return throwError(() => error);
      }),
    );
  }
}
