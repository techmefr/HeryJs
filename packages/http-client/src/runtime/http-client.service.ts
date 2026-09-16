import { Injectable } from '@nestjs/common';
import type {
  HttpRequestOptions,
  HttpResponse,
} from '#kernel/http-client/http-client-driver';
import { HttpClientDriverRegistry } from './http-client-driver.registry';

type BodylessOptions = Omit<HttpRequestOptions, 'method' | 'url'>;
type BodyOptions = Omit<HttpRequestOptions, 'method' | 'url' | 'body'>;

/**
 * The facade every caller injects, and the only thing this module exports. A
 * resource reaching past it into a concrete driver has defeated the point:
 * swapping ofetch for the fake one in tests works precisely because nothing
 * downstream ever named a driver.
 *
 * The verb methods are conveniences over the single contract method, not a
 * second API -- each one only fills in `method`, so a driver stays one
 * `request` to implement.
 */
@Injectable()
export class HttpClientService {
  constructor(private readonly registry: HttpClientDriverRegistry) {}

  request(options: HttpRequestOptions): Promise<HttpResponse> {
    return this.registry.active.request(options);
  }

  get(url: string, options: BodylessOptions = {}): Promise<HttpResponse> {
    return this.request({ ...options, method: 'GET', url });
  }

  post(
    url: string,
    body?: unknown,
    options: BodyOptions = {},
  ): Promise<HttpResponse> {
    return this.request({ ...options, method: 'POST', url, body });
  }

  put(
    url: string,
    body?: unknown,
    options: BodyOptions = {},
  ): Promise<HttpResponse> {
    return this.request({ ...options, method: 'PUT', url, body });
  }

  patch(
    url: string,
    body?: unknown,
    options: BodyOptions = {},
  ): Promise<HttpResponse> {
    return this.request({ ...options, method: 'PATCH', url, body });
  }

  delete(url: string, options: BodylessOptions = {}): Promise<HttpResponse> {
    return this.request({ ...options, method: 'DELETE', url });
  }
}
