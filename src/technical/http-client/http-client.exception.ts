import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/errors/domain.exception';

/**
 * An outbound call that came back non-2xx is a failure of a dependency, not of
 * the caller, so it surfaces as 502 rather than forwarding the remote's own
 * status -- a 404 from a payment provider does not mean *our* route is missing.
 *
 * `details` carries the method, the URL, the remote status and its body, and
 * deliberately not the request headers. Headers are where the authorization
 * bearer lives, and `details` is serialised into the error response and the
 * log line, which is precisely how an API key ends up in a log aggregator.
 */
export class HttpRequestFailedException extends DomainException {
  constructor(
    readonly method: string,
    readonly url: string,
    // Not named `status`: HttpException already owns a private field by that
    // name, and shadowing it silently reports the remote's status as ours.
    readonly responseStatus: number,
    readonly responseBody: unknown,
  ) {
    super(
      HttpStatus.BAD_GATEWAY,
      'http.request-failed',
      `${method} ${url} answered ${responseStatus}.`,
      { method, url, status: responseStatus, body: responseBody },
      'http.request-failed',
    );
  }
}

/**
 * Separate from the failed-response case because the two want different
 * handling: a timeout says nothing about whether the remote acted, so a caller
 * deciding whether it is safe to retry a payment needs to tell them apart.
 */
export class HttpRequestTimeoutException extends DomainException {
  constructor(
    readonly method: string,
    readonly url: string,
    readonly timeoutMs: number,
  ) {
    super(
      HttpStatus.GATEWAY_TIMEOUT,
      'http.request-timeout',
      `${method} ${url} did not answer within ${timeoutMs}ms.`,
      { method, url, timeoutMs },
      'http.request-timeout',
    );
  }
}

/**
 * Thrown by the fake driver when a test makes a call it never stubbed. It is a
 * 500 rather than a 4xx because it can only ever mean a missing stub: the fake
 * driver never runs in production, and a test that reaches this has asked for
 * an endpoint nobody described.
 */
export class UnstubbedHttpRequestException extends DomainException {
  constructor(
    readonly method: string,
    readonly url: string,
    readonly stubbed: readonly string[],
  ) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'http.unstubbed-request',
      `No stub matches ${method} ${url}. The fake HTTP driver refuses to reach the network, so stub it first with fake.stub("${url}", { status: 200, body: {} }). Currently stubbed: ${stubbed.length > 0 ? stubbed.join(', ') : 'nothing'}.`,
      { method, url, stubbed },
      'http.unstubbed-request',
    );
  }
}

/**
 * Raised without calling the host at all: its circuit is open because the last
 * calls to it failed, so waiting out a timeout again would only add load to a
 * dependency that is already struggling. `retryAfterMs` says when it will let
 * one call through to find out whether it recovered.
 */
export class HttpCircuitOpenException extends DomainException {
  constructor(
    readonly host: string,
    readonly retryAfterMs: number,
  ) {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      'http.circuit-open',
      `Calls to ${host} are suspended after repeated failures. Retry in ${Math.ceil(retryAfterMs / 1000)}s.`,
      { host, retryAfterMs },
      'http.circuit-open',
    );
  }
}

/**
 * The concurrency limit for one host is reached. Refused immediately rather
 * than queued: a queue in front of a slow dependency is how every worker ends
 * up waiting on it.
 */
export class HttpBulkheadFullException extends DomainException {
  constructor(
    readonly host: string,
    readonly maxConcurrent: number,
  ) {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      'http.bulkhead-full',
      `${maxConcurrent} calls to ${host} are already in flight.`,
      { host, maxConcurrent },
      'http.bulkhead-full',
    );
  }
}
