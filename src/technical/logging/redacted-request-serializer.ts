import type { IncomingMessage } from 'node:http';
import pino from 'pino';

const REDACTED_QUERY_PARAMS = ['token', 'sig'];

/**
 * pino's `redact` option only reaches structured fields (req.headers.*): it
 * never touches `req.url`, so a credential carried in the query string --
 * `/signal/stream?token=...`, `/storage/:key?sig=...` -- still lands in
 * plaintext on every request log line. This wraps pino-http's own request
 * serializer and rewrites those two params out of the url string it produces.
 */
export function redactedRequestSerializer(req: IncomingMessage) {
  const serialized = pino.stdSerializers.req(req);
  const url = new URL(serialized.url, 'http://placeholder');

  for (const param of REDACTED_QUERY_PARAMS) {
    if (url.searchParams.has(param)) {
      url.searchParams.set(param, '[redacted]');
    }
  }

  return { ...serialized, url: `${url.pathname}${url.search}` };
}
