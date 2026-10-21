import { Inject, Injectable } from '@nestjs/common';
import {
  SAML,
  SamlStatusError,
  ValidateInResponseTo,
} from '@node-saml/node-saml';
import type { CacheItem, CacheProvider, Profile } from '@node-saml/node-saml';
import { SSO_CONNECTION_STORE } from './sso-connection.store';
import type { SsoConnectionStore } from './sso-connection.store';
import { assertVerifiedEmailDomain } from './sso-domain-guard';
import type { SsoRedirect } from './sso-login.service';
import { SsoProvisioningService } from './sso-provisioning.service';
import { samlAcsUri } from './sso-saml-uri';
import { SsoRefusedException } from './sso-refused.exception';
import { sanitizeReturnTo } from './sso-return-to';
import { splitCertificates } from './sso-saml-certificate';
import { SsoStateService } from './sso-state.service';
import { SSO_REDIRECT_URI } from './sso.types';
import type {
  SsoConnectionRecord,
  SsoLoginResult,
  SsoProfile,
} from './sso.types';

const CLOCK_SKEW_MS = 60_000;
const MAX_ASSERTION_AGE_MS = 10 * 60_000;
const TRANSIENT_NAME_ID = 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient';
const EMAIL_ATTRIBUTES = [
  'email',
  'mail',
  'urn:oid:0.9.2342.19200300.100.1.3',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
];
const NAME_ATTRIBUTES = [
  'displayName',
  'urn:oid:2.16.840.1.113730.3.1.241',
  'http://schemas.microsoft.com/identity/claims/displayname',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
];
const GIVEN_NAME_ATTRIBUTES = [
  'givenName',
  'urn:oid:2.5.4.42',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
];
const SURNAME_ATTRIBUTES = [
  'sn',
  'surname',
  'urn:oid:2.5.4.4',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
];

export interface SsoSamlResponseInput {
  samlResponse: string | undefined;
  relayState: string | undefined;
  cookieValue: string | null;
}

/**
 * The AuthnRequest id is derived from the state nonce, so the signed state
 * cookie is what remembers which request is being answered: no server-side
 * store, and nothing for a second instance to be missing.
 */
function requestIdFor(nonce: string): string {
  return `_${nonce}`;
}

class SingleRequestCache implements CacheProvider {
  constructor(private readonly requestId: string) {}

  saveAsync(key: string, value: string): Promise<CacheItem | null> {
    return Promise.resolve({ value, createdAt: Date.now() });
  }

  getAsync(key: string): Promise<string | null> {
    return Promise.resolve(
      key === this.requestId ? new Date().toISOString() : null,
    );
  }

  removeAsync(key: string | null): Promise<string | null> {
    return Promise.resolve(key);
  }
}

function firstString(value: unknown): string | null {
  const candidate: unknown = Array.isArray(value) ? value[0] : value;

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function attribute(
  profile: Profile,
  names: string[],
  configured?: string,
): string | null {
  const candidates = configured ? [configured, ...names] : names;
  const attributes =
    typeof profile.attributes === 'object' && profile.attributes !== null
      ? (profile.attributes as Record<string, unknown>)
      : {};

  for (const name of candidates) {
    const found = firstString(attributes[name]) ?? firstString(profile[name]);

    if (found) {
      return found;
    }
  }

  return null;
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(value);
}

@Injectable()
export class SsoSamlService {
  constructor(
    @Inject(SSO_CONNECTION_STORE)
    private readonly connections: SsoConnectionStore,
    @Inject(SSO_REDIRECT_URI) private readonly redirectUri: string,
    private readonly states: SsoStateService,
    private readonly provisioning: SsoProvisioningService,
  ) {}

  async begin(
    connection: SsoConnectionRecord,
    returnTo: string | undefined,
  ): Promise<SsoRedirect> {
    const started = this.states.start(
      connection.id,
      sanitizeReturnTo(returnTo),
    );
    const client = this.client(connection, requestIdFor(started.nonce));
    const url = await client.getAuthorizeUrlAsync(started.state, undefined, {});

    return { url, cookieValue: started.cookieValue };
  }

  async complete(input: SsoSamlResponseInput): Promise<SsoLoginResult> {
    const payload = this.states.verify(
      input.cookieValue,
      input.relayState ?? null,
    );

    if (!input.samlResponse) {
      throw new SsoRefusedException('invalid-state');
    }

    const connection = await this.connections.findById(payload.connectionId);

    if (!connection) {
      throw new SsoRefusedException('no-connection');
    }

    if (!connection.isEnabled) {
      throw new SsoRefusedException('connection-disabled');
    }

    const profile = await this.verify(
      connection,
      requestIdFor(payload.nonce),
      input.samlResponse,
    );

    return this.provisioning.resolve(
      connection,
      this.profileFrom(connection, profile),
      sanitizeReturnTo(payload.returnTo ?? undefined),
    );
  }

  private client(connection: SsoConnectionRecord, requestId: string): SAML {
    if (
      connection.protocol !== 'saml' ||
      !connection.samlEntryPoint ||
      !connection.samlCertificate
    ) {
      throw new SsoRefusedException('invalid-state');
    }

    return new SAML({
      callbackUrl: samlAcsUri(this.redirectUri),
      entryPoint: connection.samlEntryPoint,
      issuer: connection.clientId,
      audience: connection.clientId,
      idpIssuer: connection.issuer,
      idpCert: splitCertificates(connection.samlCertificate),
      // The assertion is what carries the identity, so it is the thing that
      // must be signed; a signature on the envelope alone does not count, and
      // one on the envelope as well is not demanded of providers that sign
      // only the assertion.
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: false,
      // Only the response to the request this browser started is accepted: an
      // assertion the provider issued unprompted, or for another login, has no
      // matching id.
      validateInResponseTo: ValidateInResponseTo.always,
      cacheProvider: new SingleRequestCache(requestId),
      generateUniqueId: () => requestId,
      acceptedClockSkewMs: CLOCK_SKEW_MS,
      maxAssertionAgeMs: MAX_ASSERTION_AGE_MS,
      identifierFormat: null,
      disableRequestedAuthnContext: true,
      signatureAlgorithm: 'sha256',
    });
  }

  private async verify(
    connection: SsoConnectionRecord,
    requestId: string,
    samlResponse: string,
  ): Promise<Profile> {
    try {
      const { profile } = await this.client(
        connection,
        requestId,
      ).validatePostResponseAsync({ SAMLResponse: samlResponse });

      if (!profile || profile.issuer !== connection.issuer) {
        throw new SsoRefusedException('invalid-assertion');
      }

      return profile;
    } catch (error) {
      if (error instanceof SsoRefusedException) {
        throw error;
      }

      throw new SsoRefusedException(
        error instanceof SamlStatusError
          ? 'access-denied'
          : 'invalid-assertion',
      );
    }
  }

  private profileFrom(
    connection: SsoConnectionRecord,
    profile: Profile,
  ): SsoProfile {
    const mapping = connection.samlAttributeMapping;
    const nameId = firstString(profile.nameID);
    const email =
      attribute(profile, EMAIL_ATTRIBUTES, mapping?.email) ??
      (nameId && isEmailLike(nameId) ? nameId : null);

    if (!email) {
      throw new SsoRefusedException('email-missing');
    }

    assertVerifiedEmailDomain(connection, email);

    const subject =
      nameId && profile.nameIDFormat !== TRANSIENT_NAME_ID
        ? nameId
        : `email:${email.toLowerCase()}`;
    const given = attribute(profile, GIVEN_NAME_ATTRIBUTES, mapping?.givenName);
    const surname = attribute(profile, SURNAME_ATTRIBUTES, mapping?.surname);
    const composed = [given, surname].filter(Boolean).join(' ');

    return {
      subject,
      email: email.toLowerCase(),
      name:
        attribute(profile, NAME_ATTRIBUTES, mapping?.name) ??
        (composed || null),
      avatarUrl: null,
    };
  }
}
