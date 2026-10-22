import { LocaleContextStorage } from './locale-context';
import { registerCatalogue } from './catalogue';
import { translate } from './translate';

function inLocale<T>(locale: string, callback: () => T): T {
  return LocaleContextStorage.run(locale, callback);
}

describe('translate', () => {
  it('returns the fallback message for the fallback locale', () => {
    const message = inLocale('en', () =>
      translate('team.noCurrentTeam', undefined, 'Join a team first.'),
    );

    expect(message).toBe('Join a team first.');
  });

  it('returns the fallback message when no context is running at all', () => {
    expect(
      translate('team.noCurrentTeam', undefined, 'Join a team first.'),
    ).toBe('Join a team first.');
  });

  it('returns the catalogue entry for a translated locale', () => {
    const message = inLocale('fr', () =>
      translate('team.noCurrentTeam', undefined, 'Join a team first.'),
    );

    expect(message).toContain('équipe');
  });

  it('falls back when the catalogue has no entry for that key', () => {
    const message = inLocale('fr', () =>
      translate('capability.forbidden', undefined, 'You are not allowed.'),
    );

    expect(message).toBe('You are not allowed.');
  });

  it('interpolates a template entry from details', () => {
    const message = inLocale('fr', () =>
      translate(
        'record.notFound',
        { resource: 'BlogPost' },
        'BlogPost not found.',
      ),
    );

    expect(message).toBe('BlogPost introuvable.');
  });

  it('uses an explicit en entry over the exception message', () => {
    const message = inLocale('en', () =>
      translate(
        'admin.twoFactorRequired',
        undefined,
        'admin.twoFactorRequired',
      ),
    );

    expect(message).toContain('two-factor authentication');
  });

  it('translates a key a module registered', () => {
    registerCatalogue({ 'test.registered': { fr: 'Enregistré.' } });

    expect(
      inLocale('fr', () =>
        translate('test.registered', undefined, 'Registered.'),
      ),
    ).toBe('Enregistré.');
  });

  it('falls back when a locale is requested but not in the catalogue for that key', () => {
    const message = inLocale('es', () =>
      translate('team.noCurrentTeam', undefined, 'Join a team first.'),
    );

    expect(message).toBe('Join a team first.');
  });
});
