import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class AccountLockedException extends DomainException {
  constructor(retryAfterSeconds: number) {
    super(
      HttpStatus.TOO_MANY_REQUESTS,
      'auth.accountLocked',
      'Too many failed sign-in attempts. Try again later.',
      { retryAfterSeconds },
    );
  }
}
