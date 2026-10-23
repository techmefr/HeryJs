import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { isLocalEnvironmentNow } from '#kernel/public/config';
import { Injectable } from '@nestjs/common';
import type { CookieOptions } from 'express';
import { SsoRefusedException } from './sso-refused.exception';
import { ssoEnv } from './sso.env';

export const SSO_STATE_COOKIE = 'sso_state';
export const SSO_COOKIE_PATH = '/sso';
export const SSO_STATE_TTL_SECONDS = 10 * 60;

const TOKEN_BYTES = 32;

export interface SsoStatePayload {
  connectionId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string | null;
  exp: number;
}

export interface SsoStarted {
  cookieValue: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

function randomToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

@Injectable()
export class SsoStateService {
  start(connectionId: string, returnTo: string | null): SsoStarted {
    const codeVerifier = randomToken();
    const payload: SsoStatePayload = {
      connectionId,
      state: randomToken(),
      nonce: randomToken(),
      codeVerifier,
      returnTo,
      exp: Date.now() + SSO_STATE_TTL_SECONDS * 1000,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

    return {
      cookieValue: `${body}.${this.sign(body)}`,
      state: payload.state,
      nonce: payload.nonce,
      codeChallenge: createHash('sha256')
        .update(codeVerifier)
        .digest('base64url'),
    };
  }

  verify(
    cookieValue: string | null,
    stateParam: string | null,
  ): SsoStatePayload {
    if (!cookieValue || !stateParam) {
      throw new SsoRefusedException('invalid-state');
    }

    const [body, signature] = cookieValue.split('.');

    if (!body || !signature || !this.isEqual(this.sign(body), signature)) {
      throw new SsoRefusedException('invalid-state');
    }

    const payload = this.parse(body);

    if (payload.exp < Date.now() || !this.isEqual(payload.state, stateParam)) {
      throw new SsoRefusedException('invalid-state');
    }

    return payload;
  }

  /**
   * The SAML response comes back as a cross-site POST, which a `lax` cookie is
   * not sent on, so the sign-in that ends there needs `none` -- and browsers
   * only keep that on a secure cookie.
   */
  cookieOptions(isCrossSitePost = false): CookieOptions {
    return {
      httpOnly: true,
      sameSite: isCrossSitePost ? 'none' : 'lax',
      secure: isCrossSitePost || !isLocalEnvironmentNow(),
      path: SSO_COOKIE_PATH,
      maxAge: SSO_STATE_TTL_SECONDS * 1000,
    };
  }

  cookieFrom(header: string | undefined): string | null {
    if (!header) {
      return null;
    }

    for (const part of header.split(';')) {
      const separator = part.indexOf('=');

      if (
        separator !== -1 &&
        part.slice(0, separator).trim() === SSO_STATE_COOKIE
      ) {
        return part.slice(separator + 1).trim();
      }
    }

    return null;
  }

  private parse(body: string): SsoStatePayload {
    try {
      const payload = JSON.parse(
        Buffer.from(body, 'base64url').toString(),
      ) as SsoStatePayload;

      if (
        typeof payload.connectionId !== 'string' ||
        typeof payload.state !== 'string' ||
        typeof payload.nonce !== 'string' ||
        typeof payload.codeVerifier !== 'string' ||
        typeof payload.exp !== 'number'
      ) {
        throw new SsoRefusedException('invalid-state');
      }

      return payload;
    } catch {
      throw new SsoRefusedException('invalid-state');
    }
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
    return createHmac('sha256', ssoEnv.SSO_STATE_SECRET)
      .update(body)
      .digest('base64url');
  }
}
