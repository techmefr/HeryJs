import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/public/errors';

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
