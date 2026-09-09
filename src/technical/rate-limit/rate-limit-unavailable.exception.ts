import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

/**
 * Thrown only for the `auth` bucket: the store that counts attempts is
 * unreachable, so the guard genuinely does not know whether this caller is
 * within their limit, and answering as if they were is how a login route
 * loses its ceiling during the exact kind of outage an attacker would cause on
 * purpose. Every other bucket lets the request through instead -- a search or
 * a write route losing its limit for the length of an outage is a cost this
 * framework accepts rather than adding a second point of total failure.
 */
export class RateLimitUnavailableException extends DomainException {
  constructor() {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      'rate-limit.unavailable',
      'Unable to verify the rate limit for this request.',
    );
  }
}
