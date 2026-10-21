import { domainOfEmail, normalizeDomain } from './sso-domain';
import { sanitizeReturnTo } from './sso-return-to';

describe('normalizeDomain', () => {
  it('lowercases and trims a valid domain', () => {
    expect(normalizeDomain('  Acme.Test ')).toBe('acme.test');
  });

  it.each([
    'localhost',
    'acme',
    '-bad.test',
    'a b.test',
    'acme.t',
    'https://acme.test',
    '*.acme.test',
  ])('refuses %s', (value) => {
    expect(normalizeDomain(value)).toBeNull();
  });
});

describe('domainOfEmail', () => {
  it('reads the part after the last at sign', () => {
    expect(domainOfEmail('Jane@Acme.Test')).toBe('acme.test');
    expect(domainOfEmail('"a@b"@acme.test')).toBe('acme.test');
  });

  it('refuses an address with no usable domain', () => {
    expect(domainOfEmail('jane')).toBeNull();
    expect(domainOfEmail('@acme.test')).toBeNull();
    expect(domainOfEmail('jane@')).toBeNull();
  });
});

describe('sanitizeReturnTo', () => {
  it('keeps a local path and drops anything that could leave the origin', () => {
    expect(sanitizeReturnTo('/dashboard?x=1')).toBe('/dashboard?x=1');
    expect(sanitizeReturnTo('//evil.test')).toBeNull();
    expect(sanitizeReturnTo('https://evil.test')).toBeNull();
    expect(sanitizeReturnTo('/\\evil.test')).toBeNull();
    expect(sanitizeReturnTo(undefined)).toBeNull();
  });
});
