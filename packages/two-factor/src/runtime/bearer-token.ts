import type { Request } from 'express';
import { MissingSessionException } from '#kernel/errors/invalid-session.exception';

const BEARER_PREFIX = 'Bearer ';

export function bearerToken(request: Request): string {
  const header = request.header('authorization');

  if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
    throw new MissingSessionException();
  }

  return header.slice(BEARER_PREFIX.length);
}
