import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class RecordNotFoundException extends DomainException {
  constructor(resource: string) {
    super(
      HttpStatus.NOT_FOUND,
      `${resource}.notFound`,
      `${resource} not found.`,
    );
  }
}
