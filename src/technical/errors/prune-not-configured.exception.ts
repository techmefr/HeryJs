import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class PruneNotConfiguredException extends DomainException {
  constructor(model: string) {
    super(
      HttpStatus.NOT_FOUND,
      'prune.notConfigured',
      `${model} has no prune configuration.`,
    );
  }
}
