import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class BatchAtomicFailedException extends DomainException {
  constructor(results: unknown[], failed: number) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'batch.atomicFailed',
      `The batch was atomic and ${failed} ${failed === 1 ? 'entry' : 'entries'} failed, so nothing was written. Every entry is listed in details.results.`,
      { results, summary: { total: results.length, succeeded: 0, failed } },
    );
  }
}
