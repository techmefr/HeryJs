/**
 * The same placement, and for the same reason, as `mail-driver.ts` and
 * `export-driver.ts`: a driver ships as its own package, and
 * `.dependency-cruiser.cjs` forbids a module importing another module, so a
 * driver package could never reach a contract owned by `src/modules/*`. The
 * contract therefore lives in the kernel, where both halves can see it.
 *
 * Types and a token factory only. Nothing here imports the module, and nothing
 * here names a library: the response is a plain record so that swapping ofetch
 * for anything else stays a change inside one driver file, instead of a change
 * to every call site that ever touched a response object.
 *
 * Selection is single-active, like mail and unlike export: a caller says "GET
 * this URL", never "GET this URL over ofetch". Which driver answers is a
 * hery.config.ts line, and that is exactly what lets the whole test suite run
 * against the fake one.
 */
import { driverToken } from '#technical/drivers/driver-token';

export const HTTP_CLIENT_MODULE = 'http-client';

export function httpClientDriverToken(driverName: string): symbol {
  return driverToken(HTTP_CLIENT_MODULE, driverName);
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export type HttpQuery = Record<string, string | number | boolean>;

export type HttpHeaders = Record<string, string>;

/**
 * `query` is separate from `url` rather than left to the caller to append,
 * because hand-built query strings are where unencoded values turn into
 * requests nobody meant to send -- and because a recorded request can only be
 * matched on its parameters if they arrived as data.
 *
 * `timeoutMs` and `retries` are per-request rather than driver-wide: a health
 * ping and a report download do not want the same patience, and a driver-level
 * default would force the slowest of the two on both.
 */
export interface HttpRequestOptions {
  method: HttpMethod;
  url: string;
  headers?: HttpHeaders;
  query?: HttpQuery;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
}

/**
 * `body` is `unknown` rather than a parsed shape: the driver knows what the
 * remote sent, not what the caller expects, and typing it as anything looser
 * would hand every call site a value it can dereference without checking.
 */
export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: HttpHeaders;
  body: unknown;
}

export interface HttpClientDriver {
  request(options: HttpRequestOptions): Promise<HttpResponse>;
}
