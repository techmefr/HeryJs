import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { OAuthRefusedException } from './oauth-refused.exception';
import {
  codeChallengeFor,
  createCodeVerifier,
  randomToken,
} from './oauth-pkce';
import { OAUTH_CONFIG } from './oauth.types';
import type { OAuthConfig } from './oauth.types';

export const OAUTH_STATE_COOKIE = 'oauth_state';
export const OAUTH_COOKIE_PATH = '/oauth';
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface OAuthStatePayload {
  provider: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string | null;
  linkUserId: string | null;
  exp: number;
}

export interface OAuthStartRequest {
  provider: string;
  returnTo: string | null;
  linkUserId: string | null;
}

export interface OAuthStarted {
  cookieValue: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

@Injectable()
export class OAuthStateService {
  constructor(@Inject(OAUTH_CONFIG) private readonly config: OAuthConfig) {}

  start(request: OAuthStartRequest): OAuthStarted {
    const codeVerifier = createCodeVerifier();
    const payload: OAuthStatePayload = {
      provider: request.provider,
      state: randomToken(),
      nonce: randomToken(),
      codeVerifier,
      returnTo: request.returnTo,
      linkUserId: request.linkUserId,
      exp: Date.now() + OAUTH_STATE_TTL_SECONDS * 1000,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

    return {
      cookieValue: `${body}.${this.sign(body)}`,
      state: payload.state,
      nonce: payload.nonce,
      codeChallenge: codeChallengeFor(codeVerifier),
    };
  }

  verify(
    cookieValue: string | null,
    provider: string,
    stateParam: string | null,
  ): OAuthStatePayload {
    if (!cookieValue || !stateParam) {
      throw new OAuthRefusedException('invalid-state');
    }

    const [body, signature] = cookieValue.split('.');

    if (!body || !signature || !this.isSignatureValid(body, signature)) {
      throw new OAuthRefusedException('invalid-state');
    }

    const payload = this.parse(body);

    if (
      payload.exp < Date.now() ||
      payload.provider !== provider ||
      !this.isEqual(payload.state, stateParam)
    ) {
      throw new OAuthRefusedException('invalid-state');
    }

    return payload;
  }

  cookieFrom(header: string | undefined): string | null {
    if (!header) {
      return null;
    }

    for (const part of header.split(';')) {
      const separator = part.indexOf('=');

      if (separator === -1) {
        continue;
      }

      if (part.slice(0, separator).trim() === OAUTH_STATE_COOKIE) {
        return part.slice(separator + 1).trim();
      }
    }

    return null;
  }

  private parse(body: string): OAuthStatePayload {
    try {
      const payload = JSON.parse(
        Buffer.from(body, 'base64url').toString(),
      ) as OAuthStatePayload;

      if (
        typeof payload.provider !== 'string' ||
        typeof payload.state !== 'string' ||
        typeof payload.nonce !== 'string' ||
        typeof payload.codeVerifier !== 'string' ||
        typeof payload.exp !== 'number'
      ) {
        throw new OAuthRefusedException('invalid-state');
      }

      return payload;
    } catch {
      throw new OAuthRefusedException('invalid-state');
    }
  }

  private isSignatureValid(body: string, signature: string): boolean {
    return this.isEqual(this.sign(body), signature);
  }

  private isEqual(expected: string, provided: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);

    return (
      expectedBuffer.length === providedBuffer.length &&
      timingSafeEqual(expectedBuffer, providedBuffer)
    );
  }

  private sign(body: string): string {
    return createHmac('sha256', this.config.stateSecret)
      .update(body)
      .digest('base64url');
  }
}
