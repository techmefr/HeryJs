import { OAuthRefusedException } from './oauth-refused.exception';

export type OAuthFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export const OAUTH_FETCH = Symbol('OAUTH_FETCH');

const REQUEST_TIMEOUT_MS = 10_000;

async function requestBody(
  fetchImpl: OAuthFetch,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new OAuthRefusedException('provider-failure');
    }

    return await response.json();
  } catch (error) {
    if (error instanceof OAuthRefusedException) {
      throw error;
    }

    throw new OAuthRefusedException('provider-failure');
  }
}

export async function requestJson(
  fetchImpl: OAuthFetch,
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const body = await requestBody(fetchImpl, url, init);

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new OAuthRefusedException('provider-failure');
  }

  return body as Record<string, unknown>;
}

export async function requestJsonList(
  fetchImpl: OAuthFetch,
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>[]> {
  const body = await requestBody(fetchImpl, url, init);

  if (!Array.isArray(body)) {
    throw new OAuthRefusedException('provider-failure');
  }

  return body.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null,
  );
}

export function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

export function stringField(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key];

  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function accessTokenFrom(body: Record<string, unknown>): string {
  const token = stringField(body, 'access_token');

  if (!token) {
    throw new OAuthRefusedException('provider-failure');
  }

  return token;
}

export function decodeIdToken(idToken: string): Record<string, unknown> {
  const [, payload] = idToken.split('.');

  if (!payload) {
    throw new OAuthRefusedException('provider-failure');
  }

  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    );

    if (typeof decoded !== 'object' || decoded === null) {
      throw new OAuthRefusedException('provider-failure');
    }

    return decoded as Record<string, unknown>;
  } catch {
    throw new OAuthRefusedException('provider-failure');
  }
}

export function isTruthyClaim(value: unknown): boolean {
  return value === true || value === 'true' || value === '1' || value === 1;
}

export function audienceMatches(
  claims: Record<string, unknown>,
  clientId: string,
): boolean {
  const audience = claims.aud;

  return Array.isArray(audience)
    ? audience.includes(clientId)
    : audience === clientId;
}
