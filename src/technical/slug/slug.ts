import { randomBytes } from 'node:crypto';
import { SlugTakenException } from '#technical/errors/slug-taken.exception';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 100;
export const SLUG_FALLBACK = 'item';
// A collision lookup is bounded: past this many neighbours the numbered
// suffix gives way to a random one, and the unique index settles the rest.
export const SLUG_LOOKUP_LIMIT = 1000;
const SLUG_ATTEMPTS = 3;
const SUFFIX_RESERVE = 8;

export interface SlugFieldSpec {
  name: string;
  source: string;
  stable: boolean;
}

export interface SlugStore {
  /** Every slug of the tenant, trashed rows included, that starts with the base. */
  taken: (field: string, base: string) => Promise<ReadonlySet<string>>;
}

/** The one Prisma call a generated service makes to find the slugs around a base. */
export interface SlugDelegate {
  findMany: (args: {
    where: Record<string, unknown>;
    select: Record<string, true>;
    take: number;
  }) => Promise<Record<string, unknown>[]>;
}

type Writable = Record<string, unknown>;

/**
 * Lowercase ASCII words joined by single dashes: accents are folded rather
 * than dropped (so "Été" becomes "ete"), anything else that is not a letter or
 * a digit is a separator, and an input with nothing usable falls back to a
 * fixed word so a slug is never empty.
 */
export function slugify(text: string): string {
  const folded = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cut = folded.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, '');

  return cut === '' ? SLUG_FALLBACK : cut;
}

function randomSuffix(): string {
  return randomBytes(3).toString('hex');
}

function withSuffix(base: string, suffix: string): string {
  const room = SLUG_MAX_LENGTH - suffix.length - 1;

  return `${base.slice(0, room).replace(/-+$/g, '')}-${suffix}`;
}

/**
 * The base itself when it is free, then base-2, base-3 and so on. `random`
 * skips the counting for a retry after a lost race, where the neighbours that
 * were read are exactly the ones that turned out to be stale.
 */
export function uniqueSlug(
  base: string,
  taken: ReadonlySet<string>,
  random = false,
): string {
  if (random) {
    return withSuffix(base, randomSuffix());
  }

  if (!taken.has(base)) {
    return base;
  }

  for (let counter = 2; counter <= taken.size + 2; counter += 1) {
    const candidate = withSuffix(
      base.slice(0, SLUG_MAX_LENGTH - SUFFIX_RESERVE),
      String(counter),
    );

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return withSuffix(base, randomSuffix());
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The slug columns a write has to set. A slug the caller sends is kept as is
 * (it already matched the pattern in the DTO) and refused when another row of
 * the tenant holds it; otherwise it is derived from the source field: on
 * create always, on update only when the field is not `stable` and the source
 * actually changed. `previous` is the row being updated, whose own slug never
 * counts as taken.
 */
export async function resolveSlugs(
  data: Writable,
  specs: readonly SlugFieldSpec[],
  store: SlugStore,
  previous: Writable | null,
  attempt = 0,
): Promise<Record<string, string>> {
  const slugs: Record<string, string> = {};

  for (const spec of specs) {
    const explicit = data[spec.name];
    const current = previous ? textOf(previous[spec.name]) : '';

    if (typeof explicit === 'string') {
      if (explicit === current) {
        continue;
      }

      const neighbours = await store.taken(spec.name, explicit);

      if (neighbours.has(explicit)) {
        throw new SlugTakenException(spec.name, explicit);
      }

      slugs[spec.name] = explicit;
      continue;
    }

    if (previous && (spec.stable || !(spec.source in data))) {
      continue;
    }

    if (previous && data[spec.source] === previous[spec.source]) {
      continue;
    }

    const base = slugify(textOf(data[spec.source]));
    const neighbours = new Set(await store.taken(spec.name, base));
    neighbours.delete(current);
    const slug = uniqueSlug(base, neighbours, attempt > 0);

    if (slug !== current) {
      slugs[spec.name] = slug;
    }
  }

  return slugs;
}

/**
 * Runs a write whose slugs were derived, and tries again with fresh ones when
 * a concurrent write took the same slug between the lookup and the insert. A
 * retry appends a random suffix instead of counting the neighbours again,
 * since the ones it read are the stale ones. A slug the caller chose is never
 * retried: that collision is theirs to fix. Inside an atomic batch a unique
 * violation has already aborted the transaction, so there the conflict reaches
 * the caller instead.
 */
export async function withSlugRetry<T>(
  specs: readonly SlugFieldSpec[],
  data: Writable,
  resolve: (attempt: number) => Promise<Record<string, string>>,
  write: (slugs: Record<string, string>) => Promise<T>,
): Promise<T> {
  const chosen = specs.find((spec) => typeof data[spec.name] === 'string');

  for (let attempt = 0; ; attempt += 1) {
    const slugs = await resolve(attempt);

    try {
      return await write(slugs);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      if (chosen) {
        throw new SlugTakenException(chosen.name, textOf(data[chosen.name]));
      }

      if (attempt >= SLUG_ATTEMPTS - 1) {
        throw error;
      }
    }
  }
}
