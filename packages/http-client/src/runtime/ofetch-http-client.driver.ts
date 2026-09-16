import { Injectable } from '@nestjs/common';
import { ofetch } from 'ofetch';
import type {
  HttpClientDriver,
  HttpHeaders,
  HttpQuery,
  HttpRequestOptions,
  HttpResponse,
} from '#kernel/http-client/http-client-driver';
import {
  HttpRequestFailedException,
  HttpRequestTimeoutException,
} from '#kernel/http-client/http-client.exception';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const BACKOFF_BASE_MS = 100;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;

export interface HttpFetcherInit {
  method: string;
  headers: HttpHeaders;
  query?: HttpQuery;
  body?: unknown;
  signal: AbortSignal;
}

export interface HttpFetcherResult {
  status: number;
  headers: HttpHeaders;
  body: unknown;
}

export type HttpFetcher = (
  url: string,
  init: HttpFetcherInit,
) => Promise<HttpFetcherResult>;

export type Sleeper = (ms: number) => Promise<void>;

interface OfetchRawResponse {
  status: number;
  headers: Headers;
  // Optional because ofetch leaves it undefined on an empty body, and a
  // required field here would not match what the library actually returns.
  _data?: unknown;
}

type OfetchRaw = (
  url: string,
  options: Record<string, unknown>,
) => Promise<OfetchRawResponse>;

// Wrapped rather than aliased: `ofetch.raw` detached from `ofetch` loses its
// receiver, and a future ofetch that reads `this` would break here in a way no
// type would have caught.
const ofetchRaw: OfetchRaw = (url, options) => ofetch.raw(url, options);

const ofetchFetcher: HttpFetcher = async (url, init) => {
  const response = await ofetchRaw(url, {
    method: init.method,
    headers: init.headers,
    query: init.query,
    body: init.body,
    signal: init.signal,
    // ofetch throws on a non-2xx by default, which would turn every remote
    // error into an ofetch-shaped exception leaking into the kernel contract.
    // Retry is off for the same reason: the policy below is the one this
    // module documents, and two retry loops would multiply into 9 attempts.
    ignoreResponseError: true,
    retry: false,
  });

  return {
    status: response.status,
    headers: headersToRecord(response.headers),
    body: response._data,
  };
};

function headersToRecord(headers: Headers): HttpHeaders {
  const record: HttpHeaders = {};

  headers.forEach((value, key) => {
    record[key] = value;
  });

  return record;
}

const realSleep: Sleeper = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The real driver. Everything a caller could get wrong about an outbound call
 * -- no timeout, no retry, an error message carrying the bearer token -- is
 * decided once here rather than at each call site.
 *
 * The fetcher and the sleeper are constructor parameters with defaults so the
 * retry and timeout policy can be tested without a network or a real clock.
 * Nest never introspects them because the module provides this class through a
 * factory.
 */
@Injectable()
export class OfetchHttpClientDriver implements HttpClientDriver {
  constructor(
    private readonly fetcher: HttpFetcher = ofetchFetcher,
    private readonly sleep: Sleeper = realSleep,
  ) {}

  async request(options: HttpRequestOptions): Promise<HttpResponse> {
    const retries = options.retries ?? DEFAULT_RETRIES;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let attempt = 0;

    for (;;) {
      const outcome = await this.attempt(options, timeoutMs);
      const isLastAttempt = attempt >= retries;

      if (outcome.retryable && !isLastAttempt) {
        // Exponential rather than fixed: a remote answering 503 is usually
        // overloaded, and a fixed delay from every instance turns the retry
        // into a second wave of the traffic that caused it.
        await this.sleep(BACKOFF_BASE_MS * 2 ** attempt);
        attempt += 1;
        continue;
      }

      if (outcome.error) {
        throw outcome.error;
      }

      return outcome.response;
    }
  }

  private async attempt(
    options: HttpRequestOptions,
    timeoutMs: number,
  ): Promise<Attempt> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const result = await this.fetcher(options.url, {
        method: options.method,
        headers: options.headers ?? {},
        query: options.query,
        body: options.body,
        signal: controller.signal,
      });

      if (result.status >= 200 && result.status < 300) {
        return {
          retryable: false,
          response: {
            status: result.status,
            ok: true,
            headers: result.headers,
            body: result.body,
          },
        };
      }

      return {
        // A 4xx other than 429 is this side's mistake and will be wrong again
        // in 200ms, so retrying it only delays the error it already earned.
        retryable:
          result.status >= SERVER_ERROR || result.status === TOO_MANY_REQUESTS,
        error: new HttpRequestFailedException(
          options.method,
          options.url,
          result.status,
          result.body,
        ),
      };
    } catch (cause) {
      if (timedOut) {
        return {
          retryable: true,
          error: new HttpRequestTimeoutException(
            options.method,
            options.url,
            timeoutMs,
          ),
        };
      }

      // A transport failure -- DNS, refused connection, reset socket -- is the
      // case retrying was built for. The cause is wrapped rather than
      // rethrown so a caller never has to know what library raised it.
      return {
        retryable: true,
        error: new HttpRequestFailedException(
          options.method,
          options.url,
          0,
          messageOf(cause),
        ),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

type Attempt =
  | { retryable: boolean; error: Error; response?: undefined }
  | { retryable: false; response: HttpResponse; error?: undefined };

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
