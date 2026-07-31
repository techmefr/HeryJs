import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, tap, throwError } from 'rxjs';
import { TraceContextStorage } from '#technical/tracing/trace-context';

@Injectable()
export class PipelineInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const start = process.hrtime.bigint();
    const label = `${context.getClass().name}.${context.getHandler().name}`;

    return next.handle().pipe(
      tap(() => {
        TraceContextStorage.pushStep({
          stage: 'controller',
          label,
          status: 'ok',
          durationMs: Number(process.hrtime.bigint() - start) / 1_000_000,
        });
      }),
      catchError((error: unknown) => {
        TraceContextStorage.pushStep({
          stage: 'controller',
          label,
          status: 'error',
          durationMs: Number(process.hrtime.bigint() - start) / 1_000_000,
          detail: { message: (error as Error)?.message ?? String(error) },
        });

        return throwError(() => error);
      }),
    );
  }
}
