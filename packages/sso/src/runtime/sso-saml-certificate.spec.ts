import {
  certificateFingerprints,
  normalizeCertificates,
  splitCertificates,
} from './sso-saml-certificate';
import { generateSamlTestIdp } from './sso-saml.fakes';

function bodyOf(pem: string): string {
  return pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
}

describe('SAML signing certificates', () => {
  const first = generateSamlTestIdp('first.acme.test').certificate;
  const second = generateSamlTestIdp('second.acme.test').certificate;

  it('keeps a PEM certificate as it is', () => {
    expect(normalizeCertificates(first)).toBe(first);
  });

  it('wraps the bare base64 a metadata file carries into a PEM block', () => {
    expect(normalizeCertificates(`  ${bodyOf(first)}\n`)).toBe(first);
  });

  it('keeps several certificates, for a provider that is rotating its key', () => {
    const bundle = normalizeCertificates(`${first}\n\n${second}`);

    expect(splitCertificates(bundle ?? '')).toEqual([first, second]);
  });

  it('refuses text that is not a certificate', () => {
    expect(normalizeCertificates('not a certificate')).toBeNull();
    expect(normalizeCertificates('')).toBeNull();
    expect(normalizeCertificates(bodyOf(first).slice(0, 80))).toBeNull();
  });

  it('refuses a certificate that has expired', () => {
    expect(
      normalizeCertificates(
        generateSamlTestIdp('old.acme.test', -1000).certificate,
      ),
    ).toBeNull();
  });

  it('refuses more certificates than a rotation ever needs', () => {
    expect(
      normalizeCertificates(Array.from({ length: 6 }, () => first).join('\n')),
    ).toBeNull();
  });

  it('names each certificate by its SHA-256 fingerprint', () => {
    const fingerprints = certificateFingerprints(`${first}\n${second}`);

    expect(fingerprints).toHaveLength(2);
    expect(fingerprints[0]).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(fingerprints[0]).not.toBe(fingerprints[1]);
  });
});
