import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/errors/domain.exception';

export class StorageBodyTooLargeException extends DomainException {
  constructor(bytes: number, maxBytes: number) {
    super(
      HttpStatus.PAYLOAD_TOO_LARGE,
      'storage.body.too_large',
      `A stored file must not exceed ${maxBytes} bytes.`,
      { bytes, maxBytes },
    );
  }
}
