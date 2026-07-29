export function pascalCase(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1);
}

export function camelCase(input: string): string {
  return input.charAt(0).toLowerCase() + input.slice(1);
}

export function kebabCase(input: string): string {
  return input.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
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
