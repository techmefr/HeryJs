import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class InvalidQueryException extends DomainException {
  constructor(param: string, allowed: readonly (string | number)[]) {
    super(
      HttpStatus.BAD_REQUEST,
      'query.invalid',
      `Invalid value for "${param}". Allowed: ${allowed.join(', ')}.`,
      { param, allowed },
    );
  }
}

/**
 * Ignoring `page`/`limit` on a resource that does not paginate would leave the
 * caller believing they read page 2 of something that only ever had one page.
 * The same `query.invalid` code as any other rejected parameter, so a client
 * handles it the same way.
 */
export class PaginationNotOfferedException extends DomainException {
  constructor(param: string) {
    super(
      HttpStatus.BAD_REQUEST,
      'query.invalid',
      `"${param}" is not accepted: this resource declares no pagination, so its search route returns every match. Its describe endpoint reports "paginated": false.`,
      { param, allowed: [] },
    );
  }
}
