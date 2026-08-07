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
 * A field name and an operator are checked against the resource's own contract
 * before a query is built, but the value is not: nothing here knows the column's
 * type, so a string sent against an integer column reached the database and came
 * back as a Prisma validation error -- which the filter could only report as an
 * unknown 500, blaming the server for the caller's mistake and filling the log
 * with it. Same `query.invalid` key as any other rejected parameter.
 *
 * It cannot name the offending field: the error arrives from the driver, after
 * the request was built, and Prisma's own message is not something to forward --
 * it quotes the generated query, table and column names included.
 */
export class InvalidQueryValueException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'query.invalid',
      'One of the values in this request does not match the type of the field it is used on. Check each filter, aggregate and mutation value against the types the describe endpoint reports.',
      { param: 'value', allowed: [] },
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
