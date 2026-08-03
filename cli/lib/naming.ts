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
 * anything with a hyphen in it -- "workout-session" becomes "Workout-session",
 * which matches no Prisma model. This is the inverse kebabCase actually needs.
 */
export function kebabToPascalCase(input: string): string {
  return input
    .split('-')
    .map((segment) => pascalCase(segment))
    .join('');
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
