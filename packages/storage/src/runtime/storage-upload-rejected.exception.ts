import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/public/errors';

export class StorageUploadRejectedException extends DomainException {
  constructor(reason: string) {
    super(HttpStatus.BAD_REQUEST, 'storage.upload.rejected', reason);
  }
}
