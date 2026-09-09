import { negotiateLocale } from './locale-negotiation';

describe('negotiateLocale', () => {
  const supported = ['en', 'fr'];

  it('falls back when there is no Accept-Language header', () => {
    expect(negotiateLocale(undefined, supported, 'en')).toBe('en');
  });

  it('matches an exact supported tag', () => {
    expect(negotiateLocale('fr', supported, 'en')).toBe('fr');
  });

  it('matches a region variant by its base language', () => {
    expect(negotiateLocale('fr-FR', supported, 'en')).toBe('fr');
  });

  it('picks the highest-quality supported tag among several', () => {
    expect(negotiateLocale('de;q=0.9,fr;q=0.5,en;q=0.3', supported, 'en')).toBe(
      'fr',
    );
  });

  it('falls back when nothing requested is supported', () => {
    expect(negotiateLocale('de,es', supported, 'en')).toBe('en');
  });

  it('falls back on a wildcard', () => {
    expect(negotiateLocale('*', supported, 'en')).toBe('en');
  });
});
