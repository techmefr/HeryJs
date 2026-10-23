import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/public/errors';

export class EmbeddingRequestFailedException extends DomainException {
  constructor(reason: string) {
    super(
      HttpStatus.BAD_GATEWAY,
      'embeddings.request-failed',
      `The embedding provider could not embed the text: ${reason}`,
      { reason },
    );
  }
}
