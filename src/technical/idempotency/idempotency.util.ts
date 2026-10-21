import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const NON_REPLAYABLE_HEADERS = new Set([
  'content-length',
  'connection',
  'date',
  'transfer-encoding',
  'keep-alive',
  'set-cookie',
  'x-request-id',
]);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function hashBody(body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(body ?? {}))
    .digest('hex');
}

export function routeOf(request: Request): string {
  const route = request.route as { path?: string } | undefined;
  return `${request.method} ${route?.path ?? request.path}`;
}

export function isExpired(createdAt: Date, now: number = Date.now()): boolean {
  return now - createdAt.getTime() >= IDEMPOTENCY_TTL_MS;
}

export function capturedHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [name, value] of Object.entries(response.getHeaders())) {
    if (NON_REPLAYABLE_HEADERS.has(name.toLowerCase()) || value === undefined) {
      continue;
    }

    headers[name] = Array.isArray(value) ? value.join(', ') : String(value);
  }

  return headers;
}
