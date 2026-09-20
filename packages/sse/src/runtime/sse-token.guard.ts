import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { InvalidSessionException } from '#kernel/errors/invalid-session.exception';
import { SseTokenService } from './sse-token.service';
import type { SseTokenPayload } from './sse-token.service';

export type RequestWithSseToken = Request & {
  sseToken: SseTokenPayload;
};

@Injectable()
export class SseTokenGuard implements CanActivate {
  constructor(private readonly tokens: SseTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = String((request.query as { token?: string }).token ?? '');
    const payload = this.tokens.verify(token);

    if (!payload) {
      throw new InvalidSessionException();
    }

    (request as RequestWithSseToken).sseToken = payload;

    return true;
  }
}
