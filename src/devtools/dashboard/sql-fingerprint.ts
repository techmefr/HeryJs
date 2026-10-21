const WHITESPACE = /\s+/g;
const PLACEHOLDER_LIST = /\(\s*(?:\$\d+\s*,\s*)+\$\d+\s*\)/g;
const PLACEHOLDER = /\$\d+/g;

/**
 * Two statements are the same statement when they differ only in the values
 * they were bound to. Prisma already parameterises everything, so the only
 * variation left is whitespace, the numbering of the placeholders and the
 * length of an `IN (...)` list, which is exactly what a loop over ids produces.
 */
export function sqlFingerprint(sql: string): string {
  return sql
    .replace(WHITESPACE, ' ')
    .replace(PLACEHOLDER_LIST, '(?)')
    .replace(PLACEHOLDER, '?')
    .trim();
}
