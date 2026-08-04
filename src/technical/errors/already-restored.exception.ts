import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class AlreadyRestoredException extends DomainException {
  constructor(resource: string) {
    super(
      HttpStatus.CONFLICT,
      `${resource}.alreadyRestored`,
      `${resource} is not trashed, so it cannot be restored.`,
    );
  }
}
