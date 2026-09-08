import { validRange } from 'semver';

export interface ModuleMeta {
  /**
   * The range of HeryJs versions this module was written against, as a
   * semver range. A module leaves code behind in the project rather than
   * staying resident, so installing one built for another kernel is not a
   * runtime error the developer can undo -- it is files on disk written
   * against a contract that has moved.
   */
  compatibility: string;
}

/**
 * Every write an `install()` is allowed to make. A module never touches
 * `node:fs` itself: idempotence, the skip logging, and the record of what was
 * touched all live here, so they hold for every module rather than for the
 * ones whose author remembered them.
 */
export interface InstallContext {
  /**
   * Copies the module's own `src/runtime/` into the destination its definition
   * declares, rewriting `#kernel/` specifiers on the way. A file the developer
   * already has is skipped, never overwritten.
   */
  copyRuntime(): void;

  /**
   * Copies a file sitting at the module package's root -- a compose file, in
   * practice -- into the project root under the same name. Skipped when it is
   * already there.
   */
  copyPackageFile(name: string): void;

  /**
   * Appends model blocks the module owns outright to the project's Prisma
   * schema. The schema's path is not a parameter: it belongs to the project,
   * and a module naming it for itself is a module that can name it wrong.
   * Guarded on any of those models already being declared.
   */
  addPrismaModels(models: string): void;

  /**
   * Adds field lines to an existing Prisma model the module does *not* own --
   * impersonation needs `role` on the kernel's `User`. Guarded on the first
   * line already being present.
   */
  addModelFields(model: string, fields: string[]): void;

  /**
   * Chains a command onto one of the project's root scripts, for a module that
   * installs a workspace with a toolchain of its own.
   */
  chainScript(script: string, command: string): void;

  /** Declares a directory as a pnpm workspace, for a module that installs one. */
  addWorkspace(directory: string): void;

  /**
   * Exact-match replacements in a kernel file the module extends. The whole
   * patch is skipped once `guard` is present.
   *
   * The one general-purpose write, and it is declarative on purpose: a module
   * hands over the exact strings it replaces, so `lint:module-patches` can
   * later check the project still holds them. There is no callback taking the
   * file's source and returning a new one -- what a module writes has to be
   * readable without running it.
   */
  patchExactStrings(
    file: string,
    pairs: Array<[string, string]>,
    guard: string,
  ): void;

  /** The closing numbered list. Every module ends with one. */
  nextSteps(steps: string[]): void;

  /** Every path this install copied, wrote or patched, in order. */
  readonly touched: readonly string[];
}

export interface ModuleDefinition {
  /** The id typed on the command line. */
  name: string;

  /** The line `module:list` prints. */
  description: string;

  meta: ModuleMeta;

  /**
   * Where `src/runtime/` lands, relative to the project root. Declared rather
   * than hidden in a local constant so `lint:module-drift` can compare the two
   * copies of every file without parsing anyone's source.
   */
  dest: string;

  /** npm specifiers handed to `pnpm add -w` before `install()` runs. */
  dependencies?: string[];

  install(context: InstallContext): void | Promise<void>;
}

/**
 * A module is its default export, not a side effect. It used to call
 * `registerModule()` into a module-level Map, which only ever worked for the
 * modules living in this repository: a third-party package has no way to reach
 * that Map -- nothing is published for it to import -- and a bundled copy of it
 * would be a second Map the CLI never reads. So a community module loaded fine
 * and registered nothing, silently. Exporting the definition removes the need
 * for the author to import anything at runtime at all.
 *
 * This helper only exists for the inference; a plain object literal is a valid
 * module.
 */
export function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return definition;
}

export type ModuleChannel = 'official' | 'community';

/**
 * A definition plus what the loader knows about it and the author does not get
 * to claim: which channel it came from, and where its package sits on disk.
 */
export interface LoadedModule extends ModuleDefinition {
  channel: ModuleChannel;
  packageDir: string;
}

const REQUIRED_FIELDS = ['name', 'description', 'dest'] as const;

/**
 * Returns the reasons a value is not a module definition, empty when it is.
 * The loader reports these rather than skipping: a module that is present but
 * unusable is the one failure worth being loud about, since the symptom
 * otherwise is an install command that says nothing at all.
 */
export function definitionProblems(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) {
    return ['its default export is not an object'];
  }

  const candidate = value as Record<string, unknown>;
  const problems = REQUIRED_FIELDS.filter(
    (field) => typeof candidate[field] !== 'string' || candidate[field] === '',
  ).map((field) => `it declares no ${field}`);

  if (typeof candidate.install !== 'function') {
    problems.push('it declares no install function');
  }

  const meta = candidate.meta as Record<string, unknown> | undefined;

  if (typeof meta !== 'object' || meta === null) {
    problems.push('it declares no meta');
  } else if (
    typeof meta.compatibility !== 'string' ||
    meta.compatibility === ''
  ) {
    problems.push('it declares no meta.compatibility');
  } else if (validRange(meta.compatibility) === null) {
    problems.push(
      `its meta.compatibility "${meta.compatibility}" is not a semver range`,
    );
  }

  return problems;
}
