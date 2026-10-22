import { registerCatalogue } from '#technical/i18n/catalogue';
import { LocaleContextStorage } from '#technical/i18n/locale-context';
import { runInJobLocale, withJobLocale } from '#technical/jobs/job-locale';
import { exportCellText, exportHeaders } from './export-driver';
import type { Exportable } from './export-driver';

registerCatalogue({
  'export.test.title': { en: 'Title', fr: 'Titre' },
});

const exportable: Exportable = {
  filename: 'posts',
  columns: ['title', 'id'],
  headers: { title: 'export.test.title' },
  rows: () => [{ id: 1, title: { en: 'Hello', fr: 'Bonjour' } }],
};

describe('export locale', () => {
  it('heads and fills a French export in French, from the locale the job captured', async () => {
    const data = LocaleContextStorage.run('fr', () => withJobLocale({}));

    const [headers, cell] = await runInJobLocale(data, async () => [
      exportHeaders(exportable),
      exportCellText((await exportable.rows())[0]!.title),
    ]);

    expect(headers).toEqual(['Titre', 'id']);
    expect(cell).toBe('Bonjour');
  });

  it('never writes a translatable value as [object Object]', () => {
    expect(exportCellText({ en: 'Hello' })).toBe('Hello');
    expect(exportCellText({})).toBe('');
    expect(exportCellText(null)).toBe('');
  });
});
