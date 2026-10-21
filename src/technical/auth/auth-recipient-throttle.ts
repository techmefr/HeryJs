import { Injectable } from '@nestjs/common';
import { RateLimitExceededException } from '#technical/rate-limit/rate-limit-exceeded.exception';
import { RateLimitStore } from '#technical/rate-limit/rate-limit-store';
import { RateLimitUnavailableException } from '#technical/rate-limit/rate-limit-unavailable.exception';
import { resolveRateLimitBucket } from '#technical/rate-limit/rate-limit.config';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';

export const AUTH_RECIPIENT_BUCKET = 'auth-recipient';

const RECIPIENT_FIELD_BY_PATH: Record<string, 'email' | 'phoneNumber'> = {
  '/sign-in/magic-link': 'email',
  '/email-otp/send-verification-otp': 'email',
  '/email-otp/request-password-reset': 'email',
  '/forget-password/email-otp': 'email',
  '/phone-number/send-otp': 'phoneNumber',
  '/phone-number/request-password-reset': 'phoneNumber',
};

export function recipientOf(path: string, body: unknown): string | null {
  const field = RECIPIENT_FIELD_BY_PATH[path];

  if (!field || typeof body !== 'object' || body === null) {
    return null;
  }

  const value = (body as Record<string, unknown>)[field];

  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  return value.trim().toLowerCase();
}

/**
 * The `auth` bucket counts one caller, by IP. A code or a link is sent to
 * somebody else, so a ceiling per caller leaves that somebody's inbox -- or
 * phone bill -- open to anyone with a handful of addresses. This second
 * ceiling is keyed by the recipient, and fails closed when the store is down
 * for the same reason the `auth` bucket does.
 */
@Injectable()
export class AuthRecipientThrottle {
  constructor(private readonly store: RateLimitStore) {}

  async hit(recipient: string): Promise<void> {
    const bucket = resolveRateLimitBucket(AUTH_RECIPIENT_BUCKET);
    const key = `${AUTH_RECIPIENT_BUCKET}:${TenantContextStorage.getTenantId()}:${recipient}`;

    const result = await this.store
      .hit(key, bucket.limit, bucket.windowSeconds)
      .catch(() => null);

    if (!result) {
      throw new RateLimitUnavailableException();
    }

    if (!result.allowed) {
      throw new RateLimitExceededException(result.retryAfterSeconds);
    }
  }
}
