import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

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
