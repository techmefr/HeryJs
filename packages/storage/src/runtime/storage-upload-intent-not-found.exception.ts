import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/public/errors';

export class StorageUploadIntentNotFoundException extends DomainException {
  constructor(key: string) {
    super(
      HttpStatus.NOT_FOUND,
      'storage.upload_intent.not_found',
      'No pending upload intent matches this key, it may have expired or already been confirmed.',
      { key },
    );
  }
}
