import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class MissingSessionException extends DomainException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'auth.session.missing',
      'Missing session token.',
    );
  }
}

export class InvalidSessionException extends DomainException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'auth.session.invalid',
      'Invalid or expired session.',
    );
  }
}
