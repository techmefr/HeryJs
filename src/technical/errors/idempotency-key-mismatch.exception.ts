import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

/**
 * The same key meaning two different requests is a client bug, not something
 * to paper over by replaying whichever of the two happened to run first --
 * that would silently answer one request with another's result. A 422, not a
 * 409: the request as sent cannot be processed as long as it carries a key
 * already spent on a different body or a different route.
 */
export class IdempotencyKeyMismatchException extends DomainException {
  constructor(key: string) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'idempotency.mismatch',
      `Idempotency-Key "${key}" was already used for a different request. Reusing a key for two different requests is a client bug -- send a new key for a new request.`,
      { key },
    );
  }
}
