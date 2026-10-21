import { SlugTakenException } from '#technical/errors/slug-taken.exception';
import {
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
  resolveSlugs,
  slugify,
  uniqueSlug,
  withSlugRetry,
} from './slug';
import type { SlugFieldSpec, SlugStore } from './slug';

const SPEC: SlugFieldSpec = { name: 'slug', source: 'title', stable: false };

function storeOf(...slugs: string[]): SlugStore {
  return {
    taken: (_field, base) =>
      Promise.resolve(new Set(slugs.filter((slug) => slug.startsWith(base)))),
  };
}

describe('slugify', () => {
  it.each([
    ['Hello World', 'hello-world'],
    ['  Été à Paris !  ', 'ete-a-paris'],
    ['Rock & Roll -- 2026', 'rock-roll-2026'],
    ['already-a-slug', 'already-a-slug'],
    ['日本語', 'item'],
    ['', 'item'],
    ['---', 'item'],
  ])('turns %j into %j', (text, slug) => {
    expect(slugify(text)).toBe(slug);
  });

  it('always answers something the pattern accepts, whatever it is given', () => {
    for (const text of [
      '<script>alert(1)</script>',
      '../../etc',
      'a'.repeat(500),
      '\u0000',
    ]) {
      const slug = slugify(text);

      expect(slug).toMatch(SLUG_PATTERN);
      expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    }
  });

  it('cuts at the maximum length without leaving a dangling dash', () => {
    const slug = slugify(`${'a'.repeat(SLUG_MAX_LENGTH - 1)} b`);

    expect(slug).toBe('a'.repeat(SLUG_MAX_LENGTH - 1));
  });
});

describe('uniqueSlug', () => {
  it('keeps the base when it is free', () => {
    expect(uniqueSlug('post', new Set(['other']))).toBe('post');
  });

  it('counts up from 2 past the neighbours that exist', () => {
    expect(uniqueSlug('post', new Set(['post']))).toBe('post-2');
    expect(uniqueSlug('post', new Set(['post', 'post-2', 'post-3']))).toBe(
      'post-4',
    );
  });

  it('fills a gap rather than skipping past it', () => {
    expect(uniqueSlug('post', new Set(['post', 'post-3']))).toBe('post-2');
  });

  it('stays within the maximum length when the base is already that long', () => {
    const base = 'a'.repeat(SLUG_MAX_LENGTH);
    const slug = uniqueSlug(base, new Set([base]));

    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug).toMatch(SLUG_PATTERN);
    expect(slug).not.toBe(base);
  });

  it('appends a random suffix on a retry whatever the neighbours say', () => {
    const slug = uniqueSlug('post', new Set(), true);

    expect(slug).toMatch(/^post-[0-9a-f]{6}$/);
  });
});

describe('resolveSlugs', () => {
  it('derives the slug from the source on create', async () => {
    await expect(
      resolveSlugs({ title: 'My First Post' }, [SPEC], storeOf(), null),
    ).resolves.toEqual({ slug: 'my-first-post' });
  });

  it('numbers a slug that another row of the tenant already holds', async () => {
    await expect(
      resolveSlugs(
        { title: 'My First Post' },
        [SPEC],
        storeOf('my-first-post'),
        null,
      ),
    ).resolves.toEqual({ slug: 'my-first-post-2' });
  });

  it('keeps a slug the caller sends', async () => {
    await expect(
      resolveSlugs(
        { title: 'My First Post', slug: 'custom' },
        [SPEC],
        storeOf(),
        null,
      ),
    ).resolves.toEqual({ slug: 'custom' });
  });

  it('refuses a slug the caller sends when it is taken', async () => {
    await expect(
      resolveSlugs(
        { title: 'x', slug: 'custom' },
        [SPEC],
        storeOf('custom'),
        null,
      ),
    ).rejects.toBeInstanceOf(SlugTakenException);
  });

  it('follows the source on update when the field is not stable', async () => {
    await expect(
      resolveSlugs({ title: 'Renamed' }, [SPEC], storeOf('old-title'), {
        title: 'Old title',
        slug: 'old-title',
      }),
    ).resolves.toEqual({ slug: 'renamed' });
  });

  it('leaves the slug alone on update when the field is stable', async () => {
    await expect(
      resolveSlugs(
        { title: 'Renamed' },
        [{ ...SPEC, stable: true }],
        storeOf('old-title'),
        { title: 'Old title', slug: 'old-title' },
      ),
    ).resolves.toEqual({});
  });

  it('leaves the slug alone when the update does not touch the source', async () => {
    await expect(
      resolveSlugs({ other: 1 }, [SPEC], storeOf('old-title'), {
        title: 'Old title',
        slug: 'old-title',
      }),
    ).resolves.toEqual({});
  });

  it('leaves the slug alone when the source is sent unchanged', async () => {
    await expect(
      resolveSlugs({ title: 'Old title' }, [SPEC], storeOf('old-title'), {
        title: 'Old title',
        slug: 'old-title',
      }),
    ).resolves.toEqual({});
  });

  it('does not count the row own slug as taken when the source changes back to it', async () => {
    await expect(
      resolveSlugs({ title: 'Old Title!' }, [SPEC], storeOf('old-title'), {
        title: 'Something else',
        slug: 'old-title',
      }),
    ).resolves.toEqual({});
  });

  it('lets an explicit slug on stable fields change the slug on purpose', async () => {
    await expect(
      resolveSlugs({ slug: 'moved' }, [{ ...SPEC, stable: true }], storeOf(), {
        title: 'Old title',
        slug: 'old-title',
      }),
    ).resolves.toEqual({ slug: 'moved' });
  });
});

describe('withSlugRetry', () => {
  const unique = Object.assign(new Error('unique'), { code: 'P2002' });

  it('retries with a random suffix after a lost race', async () => {
    const written: string[] = [];
    const resolve = jest.fn((attempt: number) =>
      Promise.resolve({ slug: attempt === 0 ? 'post' : `post-${attempt}` }),
    );

    const result = await withSlugRetry(
      [SPEC],
      { title: 'Post' },
      resolve,
      (slugs) => {
        written.push(slugs.slug!);

        return written.length === 1
          ? Promise.reject(unique)
          : Promise.resolve('done');
      },
    );

    expect(result).toBe('done');
    expect(written).toEqual(['post', 'post-1']);
  });

  it('gives up after a few attempts and rethrows the violation', async () => {
    const write = jest.fn(() => Promise.reject(unique));

    await expect(
      withSlugRetry(
        [SPEC],
        { title: 'Post' },
        () => Promise.resolve({}),
        write,
      ),
    ).rejects.toBe(unique);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('turns a violation on a slug the caller chose into a conflict without retrying', async () => {
    const write = jest.fn(() => Promise.reject(unique));

    await expect(
      withSlugRetry(
        [SPEC],
        { title: 'Post', slug: 'mine' },
        () => Promise.resolve({ slug: 'mine' }),
        write,
      ),
    ).rejects.toBeInstanceOf(SlugTakenException);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('does not swallow another failure', async () => {
    const boom = new Error('boom');

    await expect(
      withSlugRetry(
        [SPEC],
        { title: 'Post' },
        () => Promise.resolve({}),
        () => Promise.reject(boom),
      ),
    ).rejects.toBe(boom);
  });
});
