import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { InvalidSessionException } from '#technical/errors/invalid-session.exception';
import { TraceContextStorage } from '#technical/tracing/trace-context';
import { SignalTokenService } from './signal-token.service';
import type { SignalTokenPayload } from './signal-token.service';

export type RequestWithSignalToken = Request & {
  signalToken: SignalTokenPayload;
};

/**
 * An EventSource cannot set an Authorization header, so the stream is reached
 * with a short-lived token in the query string, issued by POST /signal/token to
 * a caller that did hold a session. Verifying it in a guard keeps the tenant
 * the token was minted for out of the handler's hands: the handler reads
 * request.signalToken, and cannot be written to trust a channel prefix the
 * caller sent instead.
 */
@Injectable()
export class SignalTokenGuard implements CanActivate {
  constructor(private readonly tokens: SignalTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const start = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<Request>();
    const token = String((request.query as { token?: string }).token ?? '');
    const payload = this.tokens.verify(token);
    const durationMs = () =>
      Number(process.hrtime.bigint() - start) / 1_000_000;

    if (!payload) {
      TraceContextStorage.pushStep({
        stage: 'guard',
        label: 'signal token',
        status: 'blocked',
        durationMs: durationMs(),
        detail: { reason: 'invalid or expired signal token' },
      });
      throw new InvalidSessionException();
    }

    (request as RequestWithSignalToken).signalToken = payload;

    TraceContextStorage.pushStep({
      stage: 'guard',
      label: 'signal token',
      status: 'ok',
      durationMs: durationMs(),
      detail: { tenantId: payload.tenantId },
    });

    return true;
  }
}
