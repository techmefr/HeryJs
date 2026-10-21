import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/errors/domain.exception';

export class StoragePresignUnsupportedException extends DomainException {
  constructor(driverName: string) {
    super(
      HttpStatus.NOT_IMPLEMENTED,
      'storage.presign.unsupported',
      `The "${driverName}" storage driver has no presigned upload equivalent, use POST /storage/upload for local development.`,
      { driverName },
    );
  }
}
