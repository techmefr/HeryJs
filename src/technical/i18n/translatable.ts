import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { TranslationsEmptyException } from '#technical/errors/translations-empty.exception';
import { LocaleContextStorage } from './locale-context';
import {
  resolveDefaultLocale,
  resolveLocaleFallbacks,
  resolveSupportedLocales,
} from './locale.config';

export type Translations = Record<string, string>;
export type TranslationsPatch = Record<string, string | null>;
export type TranslatableInput = string | TranslationsPatch;

export interface TranslatableFieldSpec {
  name: string;
  optional: boolean;
}

export function localeChainFor(locale: string): string[] {
  const fallbacks = resolveLocaleFallbacks()[locale] ?? [];

  return [...new Set([locale, ...fallbacks, resolveDefaultLocale()])];
}

export function currentLocaleChain(): string[] {
  return localeChainFor(LocaleContextStorage.getLocale());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function translationsOf(value: unknown): Translations {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

export function resolveTranslation(
  value: unknown,
  chain: readonly string[] = currentLocaleChain(),
): string | null {
  const translations = translationsOf(value);

  for (const locale of chain) {
    const candidate = translations[locale];

    if (candidate !== undefined) {
      return candidate;
    }
  }

  return null;
}

export function mergeTranslations(
  existing: unknown,
  patch: TranslationsPatch,
): Translations {
  const merged = translationsOf(existing);

  for (const [locale, text] of Object.entries(patch)) {
    if (text === null) {
      delete merged[locale];
      continue;
    }

    merged[locale] = text;
  }

  return merged;
}

function isSupportedLocale(locale: string): boolean {
  return resolveSupportedLocales().includes(locale);
}

export function translatableInputSchema(valueRule: z.ZodString) {
  const localeRule = z
    .string()
    .refine(isSupportedLocale, { message: 'is not a supported locale' });

  return z.union([
    valueRule,
    z
      .record(localeRule, valueRule.nullable())
      .refine((patch) => Object.keys(patch).length > 0, {
        message: 'needs at least one locale',
      }),
  ]);
}

function isTranslationsPatch(value: unknown): value is TranslationsPatch {
  return isRecord(value);
}

export function normalizeTranslatableWrite(
  data: Record<string, unknown>,
  fields: readonly TranslatableFieldSpec[],
  existing?: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };

  for (const field of fields) {
    const input = data[field.name];

    if (input === undefined) {
      continue;
    }

    const patch: TranslationsPatch =
      typeof input === 'string'
        ? { [LocaleContextStorage.getLocale()]: input }
        : isTranslationsPatch(input)
          ? input
          : {};
    const merged = mergeTranslations(existing?.[field.name], patch);

    if (Object.keys(merged).length > 0) {
      result[field.name] = merged;
      continue;
    }

    if (!field.optional) {
      throw new TranslationsEmptyException(field.name);
    }

    result[field.name] = Prisma.DbNull;
  }

  return result;
}

export const TRANSLATIONS_SUFFIX = 'Translations';

export function withResolvedTranslations(
  record: Record<string, unknown>,
  names: readonly string[],
): Record<string, unknown> {
  const chain = currentLocaleChain();
  const result: Record<string, unknown> = { ...record };

  for (const name of names) {
    result[name] = resolveTranslation(record[name], chain);
    result[`${name}${TRANSLATIONS_SUFFIX}`] = translationsOf(record[name]);
  }

  return result;
}

export function searchDocumentFor(
  record: Record<string, unknown>,
  fields: readonly string[],
  translatable: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [
      field,
      translatable.includes(field)
        ? Object.values(translationsOf(record[field])).join(' ')
        : record[field],
    ]),
  );
}

export function describeLocales(): {
  supported: string[];
  default: string;
  fallbacks: Record<string, string[]>;
} {
  return {
    supported: resolveSupportedLocales(),
    default: resolveDefaultLocale(),
    fallbacks: resolveLocaleFallbacks(),
  };
}
