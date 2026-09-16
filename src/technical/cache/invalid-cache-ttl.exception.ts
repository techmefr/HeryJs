import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

/**
 * A 500 rather than a 400: no caller sends a TTL over HTTP. It comes from
 * application code or from hery.config.ts's cache.defaultTtlSeconds, so this
 * is a deployment mistake reported to whoever can fix it, not a request to
 * reject.
 */
export class InvalidCacheTtlException extends DomainException {
  constructor(ttlSeconds: number) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'cache.ttl.invalid',
      `A cache TTL must be a positive whole number of seconds, received ${ttlSeconds}.`,
      { ttlSeconds },
    );
  }
}
