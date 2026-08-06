import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { env } from '#technical/config/env';

export interface SignalTokenPayload {
  tenantId: string;
  exp: number;
}

const DEFAULT_TTL_SECONDS = 60;

@Injectable()
export class SignalTokenService {
  issue(tenantId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
    const payload: SignalTokenPayload = {
      tenantId,
      exp: Date.now() + ttlSeconds * 1000,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  verify(token: string): SignalTokenPayload | null {
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
    ) as SignalTokenPayload;

    return payload.exp >= Date.now() ? payload : null;
  }

  private sign(body: string): string {
    return createHmac('sha256', env.SIGNAL_TOKEN_SECRET)
      .update(body)
      .digest('base64url');
  }
}
