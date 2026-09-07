import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/errors/domain.exception';

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
