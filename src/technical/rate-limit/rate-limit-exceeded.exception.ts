import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export class RateLimitExceededException extends DomainException {
  constructor(retryAfterSeconds: number) {
    super(
      HttpStatus.TOO_MANY_REQUESTS,
      'rate-limit.exceeded',
      'Too many requests.',
      {
        retryAfterSeconds,
      },
    );
  }
}
