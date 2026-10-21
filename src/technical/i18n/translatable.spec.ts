import { TranslationsEmptyException } from '#technical/errors/translations-empty.exception';
import { LocaleContextStorage } from './locale-context';
import { localeChainFor } from './translatable';
import {
  describeLocales,
  mergeTranslations,
  normalizeTranslatableWrite,
  resolveTranslation,
  searchDocumentFor,
  translatableInputSchema,
  translationsOf,
  withResolvedTranslations,
} from './translatable';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const rule = z.string().min(1).max(10);

describe('translatable values', () => {
  it('walks the requested locale, its declared fallbacks, then the default', () => {
    expect(localeChainFor('fr')).toEqual(['fr', 'en']);
    expect(localeChainFor('en')).toEqual(['en']);
  });

  it('resolves along the chain and answers null when nothing in it matches', () => {
    const value = { en: 'Hello', de: 'Hallo' };

    expect(resolveTranslation(value, ['fr', 'en'])).toBe('Hello');
    expect(resolveTranslation(value, ['fr'])).toBeNull();
    expect(resolveTranslation(null, ['en'])).toBeNull();
  });

  it('resolves against the locale of the current request', () => {
    const value = { en: 'Hello', fr: 'Bonjour' };

    expect(
      LocaleContextStorage.run('fr', () => resolveTranslation(value)),
    ).toBe('Bonjour');
    expect(
      LocaleContextStorage.run('en', () => resolveTranslation(value)),
    ).toBe('Hello');
  });

  it('ignores anything in a stored value that is not text', () => {
    expect(translationsOf({ en: 'ok', fr: 3, de: null })).toEqual({ en: 'ok' });
    expect(translationsOf('plain')).toEqual({});
  });

  it('merges a patch into the stored locales and removes a null one', () => {
    expect(
      mergeTranslations({ en: 'a', fr: 'b' }, { fr: null, de: 'c' }),
    ).toEqual({ en: 'a', de: 'c' });
  });

  it('writes a plain string to the locale of the request', () => {
    const result = LocaleContextStorage.run('fr', () =>
      normalizeTranslatableWrite({ title: 'Bonjour', other: 1 }, [
        { name: 'title', optional: false },
      ]),
    );

    expect(result).toEqual({ title: { fr: 'Bonjour' }, other: 1 });
  });

  it('merges an object write into what the record already holds', () => {
    const result = normalizeTranslatableWrite(
      { title: { fr: 'Salut' } },
      [{ name: 'title', optional: false }],
      { title: { en: 'Hi', fr: 'Bonjour' } },
    );

    expect(result).toEqual({ title: { en: 'Hi', fr: 'Salut' } });
  });

  it('leaves a field the write does not mention alone', () => {
    const result = normalizeTranslatableWrite({}, [
      { name: 'title', optional: false },
    ]);

    expect(result).toEqual({});
  });

  it('refuses to leave a required field without any translation', () => {
    expect(() =>
      normalizeTranslatableWrite(
        { title: { en: null } },
        [{ name: 'title', optional: false }],
        { title: { en: 'Hi' } },
      ),
    ).toThrow(TranslationsEmptyException);
  });

  it('clears an optional field that lost its last translation', () => {
    const result = normalizeTranslatableWrite(
      { summary: { en: null } },
      [{ name: 'summary', optional: true }],
      { summary: { en: 'Hi' } },
    );

    expect(result.summary).toBe(Prisma.DbNull);
  });

  it('adds the resolved value and every translation next to the stored one', () => {
    const result = LocaleContextStorage.run('fr', () =>
      withResolvedTranslations({ id: '1', title: { en: 'Hi' } }, ['title']),
    );

    expect(result).toEqual({
      id: '1',
      title: 'Hi',
      titleTranslations: { en: 'Hi' },
    });
  });

  it('indexes every locale of a translatable field as one text', () => {
    expect(
      searchDocumentFor(
        { title: 'Plain', summary: { en: 'Hi', fr: 'Salut' } },
        ['title', 'summary'],
        ['summary'],
      ),
    ).toEqual({ title: 'Plain', summary: 'Hi Salut' });
  });

  it('publishes the supported locales, the default and the fallbacks', () => {
    expect(describeLocales()).toEqual({
      supported: ['en', 'fr'],
      default: 'en',
      fallbacks: { fr: ['en'] },
    });
  });
});

describe('translatableInputSchema', () => {
  const schema = translatableInputSchema(rule);

  it('accepts one string or an object of supported locales', () => {
    expect(schema.safeParse('hello').success).toBe(true);
    expect(schema.safeParse({ en: 'hello', fr: 'salut' }).success).toBe(true);
  });

  it('accepts a null value, which removes that locale on update', () => {
    expect(schema.safeParse({ fr: null }).success).toBe(true);
  });

  it('rejects an unsupported locale', () => {
    expect(schema.safeParse({ xx: 'nope' }).success).toBe(false);
  });

  it('applies the field rule to every locale', () => {
    expect(schema.safeParse({ en: 'ok', fr: '' }).success).toBe(false);
    expect(schema.safeParse({ en: 'this is far too long' }).success).toBe(
      false,
    );
    expect(schema.safeParse('').success).toBe(false);
  });

  it('rejects an object with no locale at all', () => {
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('still describes itself as JSON Schema for the describe endpoint', () => {
    expect(() => z.toJSONSchema(z.object({ title: schema }))).not.toThrow();
  });
});
