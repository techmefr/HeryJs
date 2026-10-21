import { inflateRawSync } from 'node:zlib';
import { SsoProvisioningService } from './sso-provisioning.service';
import { SsoSamlService } from './sso-saml.service';
import { SsoStateService } from './sso-state.service';
import {
  connectionRecord,
  InMemorySsoConnectionStore,
  InMemorySsoIdentityStore,
} from './sso.fakes';
import {
  encodeSamlResponse,
  generateSamlTestIdp,
  samlResponseXml,
} from './sso-saml.fakes';
import type { SamlAssertionOptions, SamlTestIdp } from './sso-saml.fakes';
import type { SsoConnectionRecord } from './sso.types';

const REDIRECT_URI = 'https://api.test/sso/callback';
const ACS_URL = 'https://api.test/sso/saml/acs';
const SP_ENTITY_ID = 'https://api.test/sso/saml/conn-1';
const IDP_ISSUER = 'https://idp.acme.test/metadata';
const ENTRY_POINT = 'https://idp.acme.test/sso';

interface Harness {
  service: SsoSamlService;
  identities: InMemorySsoIdentityStore;
  connections: InMemorySsoConnectionStore;
  idp: SamlTestIdp;
  connection: SsoConnectionRecord;
  begin: () => Promise<{ cookieValue: string; relayState: string; id: string }>;
  respond: (
    overrides?: Partial<SamlAssertionOptions>,
    requestId?: string,
  ) => Promise<{
    result: ReturnType<SsoSamlService['complete']>;
    xml: string;
  }>;
}

function build(
  overrides: Partial<SsoConnectionRecord> = {},
  certificates?: (idp: SamlTestIdp) => string,
): Harness {
  const idp = generateSamlTestIdp();
  const connection = connectionRecord({
    protocol: 'saml',
    issuer: IDP_ISSUER,
    clientId: SP_ENTITY_ID,
    clientSecret: null,
    samlEntryPoint: ENTRY_POINT,
    samlCertificate: certificates ? certificates(idp) : idp.certificate,
    ...overrides,
  });
  const connections = new InMemorySsoConnectionStore();
  const identities = new InMemorySsoIdentityStore();
  const states = new SsoStateService();
  const service = new SsoSamlService(
    connections,
    REDIRECT_URI,
    states,
    new SsoProvisioningService(identities),
  );

  connections.rows.push(connection);

  const begin = async () => {
    const redirect = await service.begin(connection, '/home');
    const relayState = new URL(redirect.url).searchParams.get('RelayState');
    const payload = states.verify(redirect.cookieValue, relayState);

    return {
      cookieValue: redirect.cookieValue,
      relayState: relayState ?? '',
      id: `_${payload.nonce}`,
    };
  };

  return {
    service,
    identities,
    connections,
    idp,
    connection,
    begin,
    respond: async (assertion = {}, requestId) => {
      const started = await begin();
      const xml = samlResponseXml({
        idp,
        idpIssuer: IDP_ISSUER,
        audience: SP_ENTITY_ID,
        acsUrl: ACS_URL,
        inResponseTo: requestId ?? started.id,
        email: 'jane@acme.test',
        name: 'Jane Doe',
        ...assertion,
      });

      return {
        xml,
        result: service.complete({
          samlResponse: encodeSamlResponse(xml),
          relayState: started.relayState,
          cookieValue: started.cookieValue,
        }),
      };
    },
  };
}

describe('SsoSamlService.begin', () => {
  it('redirects to the identity provider with an AuthnRequest bound to the state', async () => {
    const { service, connection } = build();

    const redirect = await service.begin(connection, '/home');
    const url = new URL(redirect.url);
    const request = inflateRawSync(
      Buffer.from(url.searchParams.get('SAMLRequest') ?? '', 'base64'),
    ).toString();

    expect(url.origin + url.pathname).toBe(ENTRY_POINT);
    expect(url.searchParams.get('RelayState')).toBeTruthy();
    expect(request).toContain(`Destination="${ENTRY_POINT}"`);
    expect(request).toContain(SP_ENTITY_ID);
    expect(request).toContain('AssertionConsumerServiceURL="' + ACS_URL + '"');
    expect(redirect.cookieValue).toContain('.');
  });

  it('refuses to start a connection that is not a complete SAML one', async () => {
    const { service, connection } = build({ samlCertificate: null });

    await expect(service.begin(connection, undefined)).rejects.toMatchObject({
      reason: 'invalid-state',
    });
  });
});

describe('SsoSamlService.complete with a signed assertion', () => {
  it('provisions the user the assertion names, in the connection tenant', async () => {
    const { respond, identities, connection } = build();

    const { result } = await respond();

    await expect(result).resolves.toMatchObject({
      outcome: 'signed-up',
      tenantId: connection.tenantId,
      connectionId: connection.id,
      returnTo: '/home',
    });
    expect(identities.users).toHaveLength(1);
    expect(identities.users[0]).toMatchObject({
      email: 'jane@acme.test',
      tenantId: 'acme',
    });
    expect(identities.identities[0]?.subject).toBe('jane@acme.test');
  });

  it('signs the same person in again on the next login', async () => {
    const { respond, identities } = build();

    await (
      await respond()
    ).result;
    const second = await (await respond()).result;

    expect(second.outcome).toBe('signed-in');
    expect(identities.users).toHaveLength(1);
  });

  it('reads the address from an attribute and the subject from the persistent name id', async () => {
    const { respond, identities } = build();

    const { result } = await respond({
      nameId: 'opaque-subject-1',
      nameIdFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
      email: 'Jane@Acme.Test',
    });

    await result;

    expect(identities.users[0]?.email).toBe('jane@acme.test');
    expect(identities.identities[0]?.subject).toBe('opaque-subject-1');
  });

  it('keys a transient name id on the address, since it changes at every login', async () => {
    const { respond, identities } = build();

    const { result } = await respond({
      nameId: 'transient-7f3a',
      nameIdFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
    });

    await result;

    expect(identities.identities[0]?.subject).toBe('email:jane@acme.test');
  });

  it('accepts a signature from either certificate while a provider rotates its key', async () => {
    const rotated = generateSamlTestIdp('idp-next.acme.test');
    const { respond, identities } = build({}, (idp) =>
      [idp.certificate, rotated.certificate].join('\n'),
    );

    const { result } = await respond({ idp: rotated });

    await expect(result).resolves.toMatchObject({ outcome: 'signed-up' });
    expect(identities.users).toHaveLength(1);
  });
});

describe('SsoSamlService.complete refuses', () => {
  const refused = { reason: 'invalid-assertion' };

  it('an unsigned assertion', async () => {
    const { respond, identities } = build();

    const { result } = await respond({ sign: 'none' });

    await expect(result).rejects.toMatchObject(refused);
    expect(identities.users).toHaveLength(0);
  });

  it('an assertion whose envelope is signed but whose assertion is not', async () => {
    const { respond, identities } = build();

    const { result } = await respond({ sign: 'response' });

    await expect(result).rejects.toMatchObject(refused);
    expect(identities.users).toHaveLength(0);
  });

  it('a signed assertion altered after signing', async () => {
    const { begin, service, idp, identities } = build();
    const started = await begin();
    const xml = samlResponseXml({
      idp,
      idpIssuer: IDP_ISSUER,
      audience: SP_ENTITY_ID,
      acsUrl: ACS_URL,
      inResponseTo: started.id,
      email: 'jane@acme.test',
    });
    const tampered = xml.split('jane@acme.test').join('boss@acme.test');

    expect(tampered).not.toBe(xml);
    await expect(
      service.complete({
        samlResponse: encodeSamlResponse(tampered),
        relayState: started.relayState,
        cookieValue: started.cookieValue,
      }),
    ).rejects.toMatchObject(refused);
    expect(identities.users).toHaveLength(0);
  });

  it('an assertion signed with a key the connection does not trust', async () => {
    const { respond, identities } = build();

    const { result } = await respond({ idp: generateSamlTestIdp() });

    await expect(result).rejects.toMatchObject(refused);
    expect(identities.users).toHaveLength(0);
  });

  it('an assertion issued for another service provider', async () => {
    const { respond } = build();

    const { result } = await respond({ audience: 'https://other.test/sp' });

    await expect(result).rejects.toMatchObject(refused);
  });

  it('an assertion from another identity provider', async () => {
    const { respond } = build();

    const { result } = await respond({ idpIssuer: 'https://evil.test/idp' });

    await expect(result).rejects.toMatchObject(refused);
  });

  it('an expired assertion', async () => {
    const { respond } = build();
    const now = Date.now();

    const { result } = await respond({
      notBefore: new Date(now - 20 * 60_000),
      notOnOrAfter: new Date(now - 10 * 60_000),
    });

    await expect(result).rejects.toMatchObject(refused);
  });

  it('an assertion the provider issued without being asked', async () => {
    const { respond } = build();

    const { result } = await respond({ inResponseTo: null });

    await expect(result).rejects.toMatchObject(refused);
  });

  it('an assertion answering another login request', async () => {
    const { respond } = build();

    const { result } = await respond({}, '_somebody-elses-request');

    await expect(result).rejects.toMatchObject(refused);
  });

  it('an address outside the domains the tenant proved', async () => {
    const { respond, identities } = build();

    const { result } = await respond({ email: 'jane@elsewhere.test' });

    await expect(result).rejects.toMatchObject({
      reason: 'email-domain-not-verified',
    });
    expect(identities.users).toHaveLength(0);
  });

  it('a response without a state cookie, or with a state that is not the cookie one', async () => {
    const { begin, service, idp } = build();
    const started = await begin();
    const samlResponse = encodeSamlResponse(
      samlResponseXml({
        idp,
        idpIssuer: IDP_ISSUER,
        audience: SP_ENTITY_ID,
        acsUrl: ACS_URL,
        inResponseTo: started.id,
        email: 'jane@acme.test',
      }),
    );

    await expect(
      service.complete({
        samlResponse,
        relayState: started.relayState,
        cookieValue: null,
      }),
    ).rejects.toMatchObject({ reason: 'invalid-state' });
    await expect(
      service.complete({
        samlResponse,
        relayState: 'another-state',
        cookieValue: started.cookieValue,
      }),
    ).rejects.toMatchObject({ reason: 'invalid-state' });
  });

  it('a connection an administrator has disabled since the login started', async () => {
    const { respond, connection } = build();

    connection.isEnabled = false;

    const { result } = await respond();

    await expect(result).rejects.toMatchObject({
      reason: 'connection-disabled',
    });
  });
});
