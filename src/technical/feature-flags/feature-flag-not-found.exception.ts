import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export class FeatureFlagNotFoundException extends DomainException {
  constructor(key: string) {
    super(
      HttpStatus.NOT_FOUND,
      'featureFlag.notFound',
      'Feature flag not found',
      {
        key,
      },
    );
  }
}
