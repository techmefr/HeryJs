import { LocaleContextStorage } from '#technical/i18n/locale-context';
import { JOB_LOCALE_KEY, runInJobLocale, withJobLocale } from './job-locale';

describe('job locale', () => {
  it('captures the locale of the request that queued the job', () => {
    const data = LocaleContextStorage.run('fr', () => withJobLocale({ id: 1 }));

    expect(data).toEqual({ [JOB_LOCALE_KEY]: 'fr', id: 1 });
  });

  it('restores it in a worker that has no request', () => {
    const data = LocaleContextStorage.run('fr', () => withJobLocale({}));

    expect(LocaleContextStorage.getLocale()).toBe('en');
    expect(runInJobLocale(data, () => LocaleContextStorage.getLocale())).toBe(
      'fr',
    );
  });

  it('runs a job queued before locales were captured in the default locale', () => {
    expect(runInJobLocale({}, () => LocaleContextStorage.getLocale())).toBe(
      'en',
    );
  });
});
