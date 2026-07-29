import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class CapabilityForbiddenException extends DomainException {
  constructor(details?: unknown) {
    super(
      HttpStatus.FORBIDDEN,
      'capability.forbidden',
      'You are not allowed to perform this action.',
      details,
    );
  }
}
