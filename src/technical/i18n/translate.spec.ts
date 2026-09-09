import { LocaleContextStorage } from './locale-context';
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

  it('falls back when a locale is requested but not in the catalogue for that key', () => {
    const message = inLocale('es', () =>
      translate('team.noCurrentTeam', undefined, 'Join a team first.'),
    );

    expect(message).toBe('Join a team first.');
  });
});
