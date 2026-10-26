/**
 * What a module author imports to type their definition, and the only part of
 * this repository a published module refers to.
 *
 * Types and nothing else, on purpose. A module is its default export -- a
 * plain object -- so it needs no code from HeryJs at install time or at run
 * time; `import type` disappears at compile time and leaves the package with
 * no dependency to resolve. Before this file there was nothing to import the
 * contract from, and every module either retyped `context` structurally or
 * reached into the CLI by relative path, which only worked from inside this
 * repository.
 */
export type {
  InstallContext,
  ModuleDefinition,
  ModuleMeta,
} from './lib/module-definition';
