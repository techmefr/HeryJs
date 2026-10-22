import { LocaleContextStorage } from '#technical/i18n/locale-context';
import { translateAdminAction, translateAdminSection } from './admin-labels';

describe('admin labels', () => {
  const section = {
    id: 'studio-users',
    title: 'Users',
    icon: 'users' as const,
    group: 'Users and access',
    columns: [
      { key: 'email', label: 'Email' },
      { key: 'custom', label: 'Custom' },
    ],
  };

  it('translates a section from the keys its id derives', () => {
    const translated = LocaleContextStorage.run('fr', () =>
      translateAdminSection(section),
    );

    expect(translated.title).toBe('Utilisateurs');
    expect(translated.group).toBe('Utilisateurs et accès');
    expect(translated.columns?.map((column) => column.label)).toEqual([
      'E-mail',
      'Custom',
    ]);
  });

  it('keeps the English the decorator declares', () => {
    expect(translateAdminSection(section).title).toBe('Users');
  });

  it('translates an action written with an admin.* key', () => {
    const action = LocaleContextStorage.run('fr', () =>
      translateAdminAction({
        id: 'custom',
        title: 'admin.studio-session-revoke.title',
        icon: 'trash' as never,
        scope: 'row',
      }),
    );

    expect(action.title).toBe('Révoquer la session');
  });
});
