import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('folds accents and joins words with single dashes', () => {
    expect(slugify('  Été à Paris !  ')).toBe('ete-a-paris');
    expect(slugify('Rock & Roll -- 2026')).toBe('rock-roll-2026');
  });

  it('answers nothing for text with no letter or digit, so no suggestion is made', () => {
    expect(slugify('')).toBe('');
    expect(slugify('---')).toBe('');
  });

  it('cuts at 100 characters without a dangling dash', () => {
    const slug = slugify('a'.repeat(99) + ' b');

    expect(slug).toBe('a'.repeat(99));
  });
});
