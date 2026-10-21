import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { env } from '#technical/config/env';
import {
  CHANGE_FEED_TOKEN_DOMAIN,
  CHANGE_FEED_TOKEN_TTL_SECONDS,
} from './change-feed.constants';
import type { ChangeFeedSubscriber } from './change-feed.types';

interface ChangeFeedTokenPayload {
  subscriber: ChangeFeedSubscriber;
  exp: number;
}

function isSubscriber(value: unknown): value is ChangeFeedSubscriber {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ChangeFeedSubscriber>;
  const subject = candidate.subject;

  return (
    typeof candidate.tenantId === 'string' &&
    typeof candidate.userId === 'string' &&
    typeof subject === 'object' &&
    subject !== null &&
    typeof subject.id === 'string' &&
    Array.isArray(subject.teamIds)
  );
}

@Injectable()
export class ChangeFeedTokenService {
  issue(
    subscriber: ChangeFeedSubscriber,
    ttlSeconds = CHANGE_FEED_TOKEN_TTL_SECONDS,
  ): string {
    const payload: ChangeFeedTokenPayload = {
      subscriber,
      exp: Date.now() + ttlSeconds * 1000,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

    return `${body}.${this.sign(body)}`;
  }

  verify(token: string): ChangeFeedSubscriber | null {
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
    ) as Partial<ChangeFeedTokenPayload>;

    if (
      typeof payload.exp !== 'number' ||
      payload.exp < Date.now() ||
      !isSubscriber(payload.subscriber)
    ) {
      return null;
    }

    return payload.subscriber;
  }

  private sign(body: string): string {
    return createHmac('sha256', env.SSE_TOKEN_SECRET)
      .update(`${CHANGE_FEED_TOKEN_DOMAIN}${body}`)
      .digest('base64url');
  }
}
