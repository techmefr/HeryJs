// The same folding as slugify in src/technical/slug/slug.ts: the admin only
// suggests, the API derives and makes it unique, so the two have to agree on
// what a base looks like.
const SLUG_MAX_LENGTH = 100;

export function slugify(text: string): string {
  const folded = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return folded.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, '');
}
