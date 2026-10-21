import { SsoRefusedException } from './sso-refused.exception';

export type SsoFetch = (input: string, init?: RequestInit) => Promise<Response>;

export const SSO_FETCH = Symbol('SSO_FETCH');

const REQUEST_TIMEOUT_MS = 10_000;

export async function requestJson(
  fetchImpl: SsoFetch,
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  try {
    const response = await fetchImpl(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new SsoRefusedException('provider-failure');
    }

    const body: unknown = await response.json();

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new SsoRefusedException('provider-failure');
    }

    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SsoRefusedException) {
      throw error;
    }

    throw new SsoRefusedException('provider-failure');
  }
}

export function stringField(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key];

  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function decodeIdToken(idToken: string): Record<string, unknown> {
  const [, payload] = idToken.split('.');

  if (!payload) {
    throw new SsoRefusedException('provider-failure');
  }

  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    );

    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      Array.isArray(decoded)
    ) {
      throw new SsoRefusedException('provider-failure');
    }

    return decoded as Record<string, unknown>;
  } catch {
    throw new SsoRefusedException('provider-failure');
  }
}
