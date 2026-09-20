import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { env } from '#technical/config/env';

export interface SseTokenPayload {
  tenantId: string;
  exp: number;
}

const DEFAULT_TTL_SECONDS = 60;

/**
 * The same short-lived, HMAC-signed token `signal` uses, minted under its own
 * secret. `EventSource` cannot set an `Authorization` header, so the session
 * is exchanged for this at `POST /sse/token` and the token itself carries the
 * tenant -- never trusted from the query string a client sends alongside it.
 */
@Injectable()
export class SseTokenService {
  issue(tenantId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
    const payload: SseTokenPayload = {
      tenantId,
      exp: Date.now() + ttlSeconds * 1000,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  verify(token: string): SseTokenPayload | null {
    const [body, signature] = token.split('.');

    if (!body || !signature) {
      return null;
    }

    const expected = Buffer.from(this.sign(body));
    const provided = Buffer.from(signature);

    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString(),
    ) as SseTokenPayload;

    return payload.exp >= Date.now() ? payload : null;
  }

  private sign(body: string): string {
    return createHmac('sha256', env.SSE_TOKEN_SECRET)
      .update(body)
      .digest('base64url');
  }
}
