import { isBuiltin } from 'node:module';

const STATIC_IMPORT =
  /^\s*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?'([^']+)';/gm;
const DYNAMIC_IMPORT = /\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g;

/** The package a specifier loads, or undefined for a relative, alias or builtin one. */
export function packageNameOf(specifier: string): string | undefined {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('#') ||
    specifier.startsWith('/') ||
    isBuiltin(specifier)
  ) {
    return undefined;
  }

  const parts = specifier.split('/');

  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** The package of a pnpm-add spec: "@scope/name@^1.0.0" is "@scope/name". */
export function bareName(spec: string): string {
  const at = spec.indexOf('@', spec.startsWith('@') ? 1 : 0);

  return at === -1 ? spec : spec.slice(0, at);
}

/**
 * Every package a source file loads at runtime: type-only imports are erased,
 * unless `withTypes` asks for what the type checker needs as well.
 */
export function runtimeImports(source: string, withTypes = false): string[] {
  const names = new Set<string>();

  for (const match of source.matchAll(STATIC_IMPORT)) {
    const name =
      (withTypes || match[2] === undefined) && match[3] !== undefined
        ? packageNameOf(match[3])
        : undefined;

    if (name !== undefined) {
      names.add(name);
    }
  }

  for (const match of source.matchAll(DYNAMIC_IMPORT)) {
    const name = match[1] === undefined ? undefined : packageNameOf(match[1]);

    if (name !== undefined) {
      names.add(name);
    }
  }

  return [...names];
}
