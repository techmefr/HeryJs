import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class NotImpersonatingException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'impersonation.notImpersonating',
      'You are not impersonating anyone.',
    );
  }
}
