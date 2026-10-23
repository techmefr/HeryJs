import { HttpStatus } from '@nestjs/common';
import { DomainException } from '@heryjs/core/errors';

export class MeilisearchTaskFailedException extends DomainException {
  constructor(operation: string, collection: string, reason: string) {
    super(
      HttpStatus.BAD_GATEWAY,
      'search.meilisearch.task_failed',
      `Meilisearch could not ${operation} on "${collection}": ${reason}`,
      { operation, collection, reason },
    );
  }
}
