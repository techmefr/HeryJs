import type { HeryConfigModuleEntry } from '../config/hery-config.types';
import type {
  HeryModuleContract,
  HeryNestImport,
} from './hery-module.contract';

const CONFIG_FILENAME = 'hery.config.ts';

export class HeryModuleConfigError extends Error {
  constructor(problems: string[]) {
    super(
      `${CONFIG_FILENAME} declares modules the kernel cannot wire:\n${problems.map((problem) => `  ${problem}`).join('\n')}`,
    );
    this.name = 'HeryModuleConfigError';
  }
}

function entryParts(entry: HeryConfigModuleEntry): [string, unknown] {
  return typeof entry === 'string' ? [entry, {}] : [entry[0], entry[1] ?? {}];
}

/**
 * Turns the `modules` of hery.config.ts into the Nest imports they stand for,
 * in the declared order. Every problem is collected before throwing, so one
 * boot names all of them: a module nobody installed, options its schema
 * refuses, a module it requires that is not declared.
 */
export function resolveHeryModules(
  entries: readonly HeryConfigModuleEntry[],
  installed: readonly HeryModuleContract[],
): HeryNestImport[] {
  const byName = new Map(
    installed.map((contract) => [contract.name, contract]),
  );
  const declared = new Set(entries.map((entry) => entryParts(entry)[0]));
  const problems: string[] = [];
  const imports: HeryNestImport[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const [name, rawOptions] = entryParts(entry);
    const contract = byName.get(name);

    if (seen.has(name)) {
      problems.push(`${name}: declared twice`);
      continue;
    }

    seen.add(name);

    if (contract === undefined) {
      problems.push(
        `${name}: unknown module, it is not installed. Run "hery install ${name.replace(/^@heryjs\//, '')}" or remove it from ${CONFIG_FILENAME}`,
      );
      continue;
    }

    const missing = (contract.requires ?? []).filter(
      (required) => !declared.has(required),
    );

    if (missing.length > 0) {
      problems.push(
        `${name}: requires ${missing.join(', ')}, which ${CONFIG_FILENAME} does not declare`,
      );
    }

    const parsed = contract.options.safeParse(rawOptions);

    if (!parsed.success) {
      problems.push(
        `${name}: invalid options, ${parsed.error.issues
          .map(
            (issue) =>
              `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`,
          )
          .join('; ')}`,
      );
      continue;
    }

    if (missing.length === 0) {
      const built = contract.module(parsed.data);
      imports.push(...(Array.isArray(built) ? built : [built]));
    }
  }

  if (problems.length > 0) {
    throw new HeryModuleConfigError(problems);
  }

  return imports;
}
