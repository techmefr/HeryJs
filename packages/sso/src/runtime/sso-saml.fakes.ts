import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { SignedXml } from 'xml-crypto';

const SHA256_WITH_RSA = Buffer.from('06092a864886f70d01010b', 'hex');
const COMMON_NAME = Buffer.from('0603550403', 'hex');
const NULL = Buffer.from([0x05, 0x00]);
const X509_V3 = Buffer.from('a003020102', 'hex');
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const RSA_BITS = 2048;

const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

export interface SamlTestIdp {
  privateKey: string;
  certificate: string;
}

function derLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length]);
  }

  const bytes: number[] = [];

  for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) {
    bytes.unshift(rest % 256);
  }

  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);

  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}

function utcTime(date: Date): Buffer {
  const text = date.toISOString().replace(/[-:T]/g, '').slice(2, 14);

  return der(0x17, Buffer.from(`${text}Z`));
}

function distinguishedName(commonName: string): Buffer {
  return der(
    0x30,
    der(0x31, der(0x30, COMMON_NAME, der(0x0c, Buffer.from(commonName)))),
  );
}

/**
 * node:crypto verifies certificates but cannot issue one, and the identity
 * provider in these specs has to present a real X.509 certificate, so this
 * assembles a minimal self-signed one: enough for X509Certificate to parse and
 * for the library to take the public key from.
 */
export function generateSamlTestIdp(
  commonName = 'idp.acme.test',
  validFor = YEAR_MS,
): SamlTestIdp {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: RSA_BITS,
  });
  const algorithm = der(0x30, SHA256_WITH_RSA, NULL);
  const name = distinguishedName(commonName);
  const now = Date.now();
  const tbs = der(
    0x30,
    X509_V3,
    der(0x02, Buffer.from([0x01])),
    algorithm,
    name,
    der(
      0x30,
      utcTime(new Date(now - 60_000)),
      utcTime(new Date(now + validFor)),
    ),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
  );
  const signature = sign('sha256', tbs, privateKey);
  const certificate = der(
    0x30,
    tbs,
    algorithm,
    der(0x03, Buffer.from([0x00]), signature),
  );
  const body = certificate.toString('base64').match(/.{1,64}/g) ?? [];

  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    certificate: [
      '-----BEGIN CERTIFICATE-----',
      ...body,
      '-----END CERTIFICATE-----',
    ].join('\n'),
  };
}

export interface SamlAssertionOptions {
  idp: SamlTestIdp;
  idpIssuer: string;
  audience: string;
  acsUrl: string;
  inResponseTo: string | null;
  email: string;
  nameId?: string;
  nameIdFormat?: string;
  name?: string;
  attributes?: Record<string, string>;
  notBefore?: Date;
  notOnOrAfter?: Date;
  sign?: 'assertion' | 'response' | 'none';
}

const MINUTE_MS = 60_000;

function attributeXml(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(
      ([name, value]) =>
        `<saml:Attribute Name="${name}"><saml:AttributeValue>${value}</saml:AttributeValue></saml:Attribute>`,
    )
    .join('');
}

function signElement(
  xml: string,
  privateKey: string,
  certificate: string,
  target: 'Assertion' | 'Response',
): string {
  const signer = new SignedXml({
    privateKey: createPrivateKey(privateKey),
    publicCert: certificate,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: EXC_C14N,
  });

  signer.addReference({
    xpath: `//*[local-name(.)='${target}']`,
    transforms: [ENVELOPED, EXC_C14N],
    digestAlgorithm: SHA256,
  });
  signer.computeSignature(xml, {
    location: {
      reference:
        target === 'Assertion'
          ? "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']"
          : "/*[local-name(.)='Response']/*[local-name(.)='Issuer']",
      action: 'after',
    },
  });

  return signer.getSignedXml();
}

/**
 * A SAML Response the way an identity provider issues it, signed with the
 * private half of the key the connection trusts. Every option the specs turn
 * to make a response invalid is a field here, so a refusal is proven against an
 * otherwise-good document and not against a malformed one.
 */
export function samlResponseXml(options: SamlAssertionOptions): string {
  const now = Date.now();
  const issued = new Date(now).toISOString();
  const notBefore = (
    options.notBefore ?? new Date(now - MINUTE_MS)
  ).toISOString();
  const notOnOrAfter = (
    options.notOnOrAfter ?? new Date(now + 5 * MINUTE_MS)
  ).toISOString();
  const inResponseTo = options.inResponseTo
    ? ` InResponseTo="${options.inResponseTo}"`
    : '';
  const attributes = {
    email: options.email,
    ...(options.name ? { displayName: options.name } : {}),
    ...options.attributes,
  };
  const xml =
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_response-1" Version="2.0" IssueInstant="${issued}" Destination="${options.acsUrl}"${inResponseTo}>` +
    `<saml:Issuer>${options.idpIssuer}</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
    `<saml:Assertion ID="_assertion-1" Version="2.0" IssueInstant="${issued}">` +
    `<saml:Issuer>${options.idpIssuer}</saml:Issuer>` +
    `<saml:Subject><saml:NameID Format="${options.nameIdFormat ?? 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'}">${options.nameId ?? options.email}</saml:NameID>` +
    `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" Recipient="${options.acsUrl}"${inResponseTo}/></saml:SubjectConfirmation></saml:Subject>` +
    `<saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}"><saml:AudienceRestriction><saml:Audience>${options.audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions>` +
    `<saml:AuthnStatement AuthnInstant="${issued}" SessionIndex="_session-1"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>` +
    `<saml:AttributeStatement>${attributeXml(attributes)}</saml:AttributeStatement>` +
    `</saml:Assertion></samlp:Response>`;

  switch (options.sign ?? 'assertion') {
    case 'none':
      return xml;
    case 'response':
      return signElement(
        xml,
        options.idp.privateKey,
        options.idp.certificate,
        'Response',
      );
    default:
      return signElement(
        xml,
        options.idp.privateKey,
        options.idp.certificate,
        'Assertion',
      );
  }
}

export function encodeSamlResponse(xml: string): string {
  return Buffer.from(xml).toString('base64');
}
