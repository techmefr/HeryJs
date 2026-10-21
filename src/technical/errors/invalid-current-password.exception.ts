import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class InvalidCurrentPasswordException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'auth.currentPasswordInvalid',
      'The current password is incorrect.',
    );
  }
}
