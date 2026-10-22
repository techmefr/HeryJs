import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export class BackupNotFoundException extends DomainException {
  constructor(name: string) {
    super(
      HttpStatus.NOT_FOUND,
      'backup.notFound',
      `There is no backup named ${name}.`,
      { name },
    );
  }
}

export class BackupConfirmationMismatchException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'backup.confirmationMismatch',
      'The confirmation does not match the backup name; nothing was restored.',
    );
  }
}
