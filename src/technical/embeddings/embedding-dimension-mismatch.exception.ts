import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export class EmbeddingDimensionMismatchException extends DomainException {
  constructor(expected: number, received: number) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'embeddings.dimension-mismatch',
      `The embedding driver returned ${received} dimensions but the vector column declares ${expected}. Align the blueprint's dimensions with the model the driver calls.`,
      { expected, received },
    );
  }
}
