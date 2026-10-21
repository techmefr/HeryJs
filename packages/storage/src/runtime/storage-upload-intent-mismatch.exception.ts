import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/errors/domain.exception';

export class StorageUploadIntentMismatchException extends DomainException {
  constructor(reason: string, details: Record<string, unknown>) {
    super(
      HttpStatus.CONFLICT,
      'storage.upload_intent.mismatch',
      reason,
      details,
    );
  }
}
