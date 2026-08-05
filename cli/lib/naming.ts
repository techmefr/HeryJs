export function pascalCase(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1);
}

export function camelCase(input: string): string {
  return input.charAt(0).toLowerCase() + input.slice(1);
}

export function kebabCase(input: string): string {
  return input.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * pascalCase only uppercases the first character, so it round-trips a name
 * that was already single-word (kebabCase's own output for one) but mangles
 * anything with a hyphen in it -- "blog-post" becomes "Blog-post",
 * which matches no Prisma model. This is the inverse kebabCase actually needs.
 */
export function kebabToPascalCase(input: string): string {
  return input
    .split('-')
    .map((segment) => pascalCase(segment))
    .join('');
}

/**
 * Built on kebabCase's own word-boundary splitting rather than a bare
 * `.toUpperCase()` -- a multi-word name like "BlogPost" has no word boundary
 * left to find once it is all uppercase, so `.toUpperCase()` alone produces
 * "BLOGPOST", not "BLOG_POST".
 */
export function screamingSnakeCase(input: string): string {
  return kebabCase(input).toUpperCase().replace(/-/g, '_');
}

export function pluralize(input: string): string {
  if (/[^aeiou]y$/i.test(input)) {
    return `${input.slice(0, -1)}ies`;
  }

  if (/(s|x|z|ch|sh)$/i.test(input)) {
    return `${input}es`;
  }

  return `${input}s`;
}
