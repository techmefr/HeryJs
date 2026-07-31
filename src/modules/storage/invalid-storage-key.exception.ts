import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export class InvalidStorageKeyException extends DomainException {
  constructor(key: string) {
    super(
      HttpStatus.BAD_REQUEST,
      'storage.key.invalid',
      'A storage key must stay inside the storage root.',
      { key },
    );
  }
}
