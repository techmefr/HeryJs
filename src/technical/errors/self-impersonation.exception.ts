import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class SelfImpersonationException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'impersonation.self',
      'You cannot impersonate yourself.',
    );
  }
}
