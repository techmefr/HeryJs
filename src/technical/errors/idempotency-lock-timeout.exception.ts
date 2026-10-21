import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

/**
 * Every other retry with this key is either still running or crashed without
 * releasing the lock and its TTL has not yet expired. Either way, this
 * caller cannot be told the outcome yet -- a 409 says so, rather than the
 * request hanging until the HTTP client itself times out.
 */
export class IdempotencyLockTimeoutException extends DomainException {
  constructor(key: string) {
    super(
      HttpStatus.CONFLICT,
      'idempotency.lock-timeout',
      `Could not get exclusive access to Idempotency-Key "${key}" in time. Another request with the same key is still being processed -- retry shortly.`,
      { key },
    );
  }
}
