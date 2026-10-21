import { SsoSecretService } from './sso-secret.service';

describe('SsoSecretService', () => {
  const service = new SsoSecretService();

  it('opens what it sealed', () => {
    const sealed = service.seal('top-secret', 'conn-1');

    expect(service.open(sealed, 'conn-1')).toBe('top-secret');
  });

  it('never stores the plaintext and varies the output per call', () => {
    const first = service.seal('top-secret', 'conn-1');
    const second = service.seal('top-secret', 'conn-1');

    expect(first).not.toContain('top-secret');
    expect(first).not.toBe(second);
  });

  it('refuses a ciphertext moved to another connection', () => {
    const sealed = service.seal('top-secret', 'conn-1');

    expect(() => service.open(sealed, 'conn-2')).toThrow();
  });

  it('refuses a tampered ciphertext', () => {
    const [version, iv, tag, body] = service
      .seal('top-secret', 'conn-1')
      .split(':');
    const flipped = `${body?.slice(0, -2)}AA`;

    expect(() =>
      service.open([version, iv, tag, flipped].join(':'), 'conn-1'),
    ).toThrow();
  });

  it('refuses a value that is not in the sealed format', () => {
    expect(() => service.open('plain-text', 'conn-1')).toThrow(/known format/);
  });
});
