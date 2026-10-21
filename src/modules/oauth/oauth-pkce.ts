import { createHash, randomBytes } from 'node:crypto';

const VERIFIER_BYTES = 48;
const TOKEN_BYTES = 32;

export function randomToken(bytes = TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url');
}

export function createCodeVerifier(): string {
  return randomToken(VERIFIER_BYTES);
}

export function codeChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
