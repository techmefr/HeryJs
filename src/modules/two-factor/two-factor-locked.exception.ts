import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export class TwoFactorLockedException extends DomainException {
  constructor(retryAfterSeconds: number) {
    super(
      HttpStatus.TOO_MANY_REQUESTS,
      'two-factor.locked',
      'Too many wrong codes. Try again later.',
      { retryAfterSeconds },
    );
  }
}
