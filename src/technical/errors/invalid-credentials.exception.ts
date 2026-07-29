import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'auth.invalidCredentials',
      'Invalid credentials.',
    );
  }
}
