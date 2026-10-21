import { decryptSecret, encryptSecret } from './secret-cipher';

describe('secret cipher', () => {
  it('round-trips a secret and never stores it readable', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXP');

    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(stored)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('uses a fresh nonce each time', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('refuses a tampered value', () => {
    const [version, iv, tag, body] = encryptSecret('secret').split('.');
    const flipped = `${body?.startsWith('A') ? 'B' : 'A'}${body?.slice(1)}`;

    expect(() =>
      decryptSecret([version, iv, tag, flipped].join('.')),
    ).toThrow();
  });

  it('refuses a value in an unknown format', () => {
    expect(() => decryptSecret('plain')).toThrow();
  });
});
