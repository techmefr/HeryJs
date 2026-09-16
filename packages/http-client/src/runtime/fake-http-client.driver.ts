import { Injectable } from '@nestjs/common';
import type {
  HttpClientDriver,
  HttpHeaders,
  HttpRequestOptions,
  HttpResponse,
} from '#kernel/http-client/http-client-driver';
import { UnstubbedHttpRequestException } from '#kernel/http-client/http-client.exception';

export interface HttpStub {
  status?: number;
  headers?: HttpHeaders;
  body?: unknown;
}

export interface RecordedHttpRequest {
  method: string;
  url: string;
  query?: HttpRequestOptions['query'];
  body?: unknown;
}

const DEFAULT_STATUS = 200;

/**
 * The module's default driver, and the one every test runs against -- the
 * `Http::fake()` of this framework.
 *
 * Every other module ships a default that does the harmless version of its job:
 * mail logs instead of sending, storage writes to local disk. The harmless
 * version of an outbound HTTP call is not "make the call anyway against a
 * sandbox"; it is not making it. So this driver has no network path at all, and
 * an unstubbed URL throws instead of returning an empty 200.
 *
 * That choice is the entire safety property. A driver that returned a bland
 * `{ status: 200, body: {} }` for anything unknown would let a test pass while
 * asserting nothing, and would let a misconfigured production app look healthy
 * while every integration silently no-opped. Throwing makes both failures
 * arrive at the first call, naming the URL and listing what was stubbed.
 */
@Injectable()
export class FakeHttpClientDriver implements HttpClientDriver {
  private readonly stubs = new Map<string, HttpStub>();
  private readonly requests: RecordedHttpRequest[] = [];

  /**
   * Later stubs replace earlier ones for the same pattern, so a test can
   * override an endpoint set up in a shared `beforeEach` without having to
   * tear the whole fake down first.
   */
  stub(pattern: string, response: HttpStub = {}): void {
    this.stubs.set(pattern, response);
  }

  reset(): void {
    this.stubs.clear();
    this.requests.length = 0;
  }

  get recorded(): readonly RecordedHttpRequest[] {
    return this.requests;
  }

  /**
   * Recording happens before matching, so a test that fails on a missing stub
   * can still inspect what was attempted -- which is usually the fastest way
   * to find out that the URL was built wrong rather than merely unstubbed.
   */
  request(options: HttpRequestOptions): Promise<HttpResponse> {
    this.requests.push({
      method: options.method,
      url: options.url,
      query: options.query,
      body: options.body,
    });

    const stub = this.match(options.url);

    // Rejected rather than thrown synchronously, so a missing stub surfaces
    // the same way a real network failure would -- a caller with a try/catch
    // around its await catches it without needing a second guard.
    if (!stub) {
      return Promise.reject(
        new UnstubbedHttpRequestException(options.method, options.url, [
          ...this.stubs.keys(),
        ]),
      );
    }

    const status = stub.status ?? DEFAULT_STATUS;

    return Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      headers: stub.headers ?? {},
      body: stub.body ?? null,
    });
  }

  /**
   * The most recently registered matching pattern wins, rather than the most
   * specific one: "most specific" has no obvious definition once patterns
   * overlap in two directions, and registration order is something the test
   * author can see in their own file.
   */
  private match(url: string): HttpStub | undefined {
    let found: HttpStub | undefined;

    for (const [pattern, stub] of this.stubs) {
      if (toMatcher(pattern).test(url)) {
        found = stub;
      }
    }

    return found;
  }
}

/**
 * `*` is the only wildcard on purpose. Accepting raw regular expressions would
 * make a stub pattern able to match far more than its author read it as -- a
 * bare `.` silently matching any character is how a stub for one vendor starts
 * answering for another.
 */
function toMatcher(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`^${escaped.split('\\*').join('.*')}$`);
}
