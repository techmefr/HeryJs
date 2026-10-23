import { HttpStatus } from '@nestjs/common';
import { DomainException } from '@heryjs/core/errors';

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
