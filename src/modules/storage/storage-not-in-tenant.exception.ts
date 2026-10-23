import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/public/errors';

export class StorageNotInTenantException extends DomainException {
  constructor(key: string) {
    super(
      HttpStatus.NOT_FOUND,
      'storage.key.not_found',
      'No file with that key exists for this tenant.',
      { key },
    );
  }
}
