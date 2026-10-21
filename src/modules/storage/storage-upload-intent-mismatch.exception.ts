import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

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
