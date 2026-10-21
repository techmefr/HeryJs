import { X509Certificate } from 'node:crypto';

const MAX_CERTIFICATES = 5;
const PEM_LINE_LENGTH = 64;
const PEM_BLOCK =
  /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function bodiesOf(value: string): string[] {
  const blocks = [...value.matchAll(PEM_BLOCK)].map((match) => match[1] ?? '');
  const bodies = blocks.length > 0 ? blocks : [value];

  return bodies.map((body) => body.replace(/\s+/g, ''));
}

function toPem(body: string): string {
  const lines = body.match(new RegExp(`.{1,${PEM_LINE_LENGTH}}`, 'g')) ?? [];

  return [
    '-----BEGIN CERTIFICATE-----',
    ...lines,
    '-----END CERTIFICATE-----',
  ].join('\n');
}

/**
 * Turns what an administrator pasted -- one or several PEM blocks, or the bare
 * base64 body a SAML metadata file carries in `X509Certificate` -- into a PEM
 * bundle, or null when any of it is not a certificate that is still valid.
 * Several are accepted so an identity provider can rotate its signing key
 * without a window where its assertions are refused.
 */
export function normalizeCertificates(value: string): string | null {
  const bodies = bodiesOf(value.trim());

  if (
    bodies.length === 0 ||
    bodies.length > MAX_CERTIFICATES ||
    bodies.some((body) => !BASE64.test(body))
  ) {
    return null;
  }

  try {
    const now = Date.now();
    const pems = bodies.map((body) => {
      const certificate = new X509Certificate(Buffer.from(body, 'base64'));

      if (new Date(certificate.validTo).getTime() < now) {
        throw new Error('expired');
      }

      return toPem(body);
    });

    return pems.join('\n');
  } catch {
    return null;
  }
}

export function splitCertificates(bundle: string): string[] {
  return [...bundle.matchAll(PEM_BLOCK)].map((match) => match[0]);
}

export function certificateFingerprints(bundle: string): string[] {
  return splitCertificates(bundle).map(
    (pem) => new X509Certificate(pem).fingerprint256,
  );
}
