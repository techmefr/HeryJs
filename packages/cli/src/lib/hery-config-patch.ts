import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

export const HERY_CONFIG_FILE = 'hery.config.ts';
export const HERY_MODULES_FILE = path.join('src', 'hery.modules.ts');

const MODULES_ARRAY = /^( {2})modules: \[([^\]]*)\],?\n/m;
const DEFAULT_EXPORT = /^export default \{\n/m;

function quoted(text: string): string {
  return `'${text.replace(/[\\']/g, '\\$&')}'`;
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The module names hery.config.ts declares as plain strings, in order. */
export function declaredModules(config: string): string[] {
  const body = MODULES_ARRAY.exec(config)?.[2] ?? '';

  return [...body.matchAll(/^\s*'([^']+)',?$/gm)].map((match) => match[1]!);
}

/**
 * Adds a module to the `modules` of hery.config.ts, creating the array at the
 * top of the default export when the config has none. A module already
 * declared, bare or with options, is left as it is.
 */
export function declareModule(config: string, name: string): string {
  if (new RegExp(`['"]${escaped(name)}['"]`).test(config)) {
    return config;
  }

  const existing = MODULES_ARRAY.exec(config);

  if (existing === null) {
    if (!DEFAULT_EXPORT.test(config)) {
      throw new Error(
        `${HERY_CONFIG_FILE} has no "export default {" to declare ${name} in`,
      );
    }

    return config.replace(
      DEFAULT_EXPORT,
      (start) => `${start}  modules: [\n    ${quoted(name)},\n  ],\n`,
    );
  }

  const entries = existing[2]!.replace(/\s+$/, '');
  const separator = entries === '' || entries.endsWith(',') ? '' : ',';

  return config.replace(
    existing[0],
    `  modules: [${entries}${separator}\n    ${quoted(name)},\n  ],\n`,
  );
}

/** Takes a module out of hery.config.ts, bare or with its options. */
export function undeclareModule(config: string, name: string): string {
  return config
    .replace(new RegExp(`^[ \\t]*'${escaped(name)}',?\\n`, 'm'), '')
    .replace(
      new RegExp(`^[ \\t]*\\[\\s*'${escaped(name)}',[\\s\\S]*?\\],?\\n`, 'm'),
      '',
    );
}

/** The import a project registers a module's contract under. */
export function contractIdentifier(moduleName: string): string {
  const camel = moduleName.replace(/-([a-z0-9])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );

  return `${camel}HeryModule`;
}

/** The specifier of a contract installed at `dest`, from src/hery.modules.ts. */
export function contractSpecifier(dest: string, moduleName: string): string {
  const relative = path
    .relative('src', path.join(dest, `${moduleName}.hery`))
    .split(path.sep)
    .join('/');

  return relative.startsWith('modules/')
    ? `#${relative}`
    : `./${relative.replace(/^\.\//, '')}`;
}

export const EMPTY_REGISTRY = `import type { HeryModuleContract } from '@heryjs/core/modules';

export const heryModules: HeryModuleContract[] = [];
`;

const REGISTRY_ARRAY =
  /^export const heryModules: HeryModuleContract\[\] = \[([^\]]*)\];\n/m;

/**
 * Lists a module's contract in src/hery.modules.ts, the file HeryModule reads
 * the installed contracts from. `hery install` writes it, so AppModule never
 * names a module.
 */
export function registerContract(
  registry: string,
  identifier: string,
  specifier: string,
): string {
  if (registry.includes(`from '${specifier}';`)) {
    return registry;
  }

  const array = REGISTRY_ARRAY.exec(registry);

  if (array === null) {
    throw new Error(`${HERY_MODULES_FILE} has no heryModules array`);
  }

  const identifiers = [
    ...array[1]!.split(',').map((entry) => entry.trim()),
    identifier,
  ].filter((entry) => entry !== '');
  const imports = registry.slice(0, array.index).replace(/\n+$/, '\n');

  return `${imports}import ${identifier} from '${specifier}';\n\nexport const heryModules: HeryModuleContract[] = [\n${identifiers.map((entry) => `  ${entry},\n`).join('')}];\n`;
}

/** Takes a contract back out of src/hery.modules.ts. */
export function unregisterContract(
  registry: string,
  identifier: string,
): string {
  const withoutImport = registry.replace(
    new RegExp(`^import ${escaped(identifier)} from '[^']+';\\n`, 'm'),
    '',
  );
  const array = REGISTRY_ARRAY.exec(withoutImport);

  if (array === null) {
    return withoutImport;
  }

  const identifiers = array[1]!
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '' && entry !== identifier);
  const body =
    identifiers.length === 0
      ? '[]'
      : `[\n${identifiers.map((entry) => `  ${entry},\n`).join('')}]`;

  return withoutImport.replace(
    array[0],
    `export const heryModules: HeryModuleContract[] = ${body};\n`,
  );
}

export interface ModuleWiring {
  name: string;
  moduleName: string;
  dest: string;
}

/**
 * Declares an installed module in hery.config.ts and registers its contract,
 * when its runtime ships one. Returns the files written.
 */
export function wireModule(root: string, wiring: ModuleWiring): string[] {
  if (
    !existsSync(path.join(root, wiring.dest, `${wiring.moduleName}.hery.ts`))
  ) {
    return [];
  }

  const written: string[] = [];
  const configFile = path.join(root, HERY_CONFIG_FILE);
  const registryFile = path.join(root, HERY_MODULES_FILE);
  const config = readFileSync(configFile, 'utf8');
  const declared = declareModule(config, wiring.name);

  if (declared !== config) {
    writeFileSync(configFile, declared);
    written.push(HERY_CONFIG_FILE);
  }

  const registry = existsSync(registryFile)
    ? readFileSync(registryFile, 'utf8')
    : EMPTY_REGISTRY;
  const registered = registerContract(
    registry,
    contractIdentifier(wiring.moduleName),
    contractSpecifier(wiring.dest, wiring.moduleName),
  );

  if (registered !== registry || !existsSync(registryFile)) {
    writeFileSync(registryFile, registered);
    written.push(HERY_MODULES_FILE);
  }

  return written;
}

/** Reverses `wireModule`. Returns the files written. */
export function unwireDeclaredModule(
  root: string,
  wiring: ModuleWiring,
): string[] {
  const written: string[] = [];
  const configFile = path.join(root, HERY_CONFIG_FILE);
  const registryFile = path.join(root, HERY_MODULES_FILE);

  if (existsSync(configFile)) {
    const config = readFileSync(configFile, 'utf8');
    const undeclared = undeclareModule(config, wiring.name);

    if (undeclared !== config) {
      writeFileSync(configFile, undeclared);
      written.push(HERY_CONFIG_FILE);
    }
  }

  if (existsSync(registryFile)) {
    const registry = readFileSync(registryFile, 'utf8');
    const unregistered = unregisterContract(
      registry,
      contractIdentifier(wiring.moduleName),
    );

    if (unregistered !== registry) {
      writeFileSync(registryFile, unregistered);
      written.push(HERY_MODULES_FILE);
    }
  }

  return written;
}

/** The npm name a module is declared under: its package's own name. */
export function modulePackageName(
  packageDir: string,
  moduleName: string,
): string {
  const manifest = path.join(packageDir, 'package.json');

  if (!existsSync(manifest)) {
    return `@heryjs/${moduleName}`;
  }

  const { name } = JSON.parse(readFileSync(manifest, 'utf8')) as {
    name?: string;
  };

  return name ?? `@heryjs/${moduleName}`;
}
