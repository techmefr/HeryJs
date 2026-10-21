import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

export class TenantQuotaExceededException extends DomainException {
  constructor(name: string, limit: number, used: number) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'quota.exceeded',
      `This tenant has used ${used} of the ${limit} allowed for "${name}".`,
      { name, limit, used },
    );
  }
}

export class QuotaNotDeclaredException extends DomainException {
  constructor(name: string) {
    super(
      HttpStatus.NOT_FOUND,
      'quota.notDeclared',
      `No quota named "${name}" is declared in hery.config.ts.`,
      { name },
    );
  }
}
