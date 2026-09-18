import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/errors/domain.exception';

export class QuotaExceededException extends DomainException {
  constructor(feature: string, limit: number) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'billing.quotaExceeded',
      `This tenant's plan allows at most ${limit} for "${feature}".`,
      { feature, limit },
      'billing.quota.exceeded',
    );
  }
}
