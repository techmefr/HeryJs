---
title: Publishing a module
description: What an npm package has to look like for hery install to find it, and what a published module ships.
---

There is no registry to submit to and nothing curated on this side. The community channel is one line in your `package.json`:

```json
{
  "heryjs": { "module": true }
}
```

Any package a project depends on that carries that marker is scanned; anything else the loader walks straight past. `hery list` shows it alongside the official ones, tagged `community`, and `hery install <name>` runs it.

The two channels declare the same things. The eleven official modules are published as `@heryjs/<name>` and carry that marker too — so what this page asks of your package is what they ship, and a fork of one of them is a module like any other.

A complete example lives in [`examples/hery-module-maintenance`](https://github.com/techmefr/HeryJs/tree/main/examples/hery-module-maintenance) — a guard answering `503` while the app is in maintenance, with its definition, its runtime, its exception and its spec. It is the smallest module that still exercises every part of the contract, and this repository's own test suite loads it the way the CLI does.

## Start from the scaffold

```bash
pnpm hery module:new maintenance
```

It writes a package that already satisfies the contract — the definition, the two tsconfigs, a runtime, a spec, a README npm will render, and a manifest declaring everything below — so your first run is never spent on the shape of the thing. Move that directory into its own repository and you have a publishable module; nothing in it is specific to this repository.

## What the package has to declare

```json
{
  "name": "hery-module-maintenance",
  "version": "0.1.0",
  "description": "One sentence, which is the line hery module:list prints.",
  "license": "MIT",
  "main": "dist/module.js",
  "types": "dist/module.d.ts",
  "files": ["dist", "src/runtime"],
  "heryjs": { "module": true },
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json",
    "prepack": "pnpm run build"
  },
  "peerDependencies": { "@nestjs/common": "^12.0.0" },
  "devDependencies": { "heryjs": "^0.1.0" }
}
```

`heryjs` is a dev dependency, not a runtime one: it carries the types your definition is checked against, and nothing of it survives compilation.

Three of those lines are the ones that go wrong:

**`main` points at compiled JavaScript.** The CLI `require`s your entry point, and it runs under ts-node — which ignores `node_modules` by default. A package shipping only TypeScript sources for its entry loads nowhere but in your own repository.

**`files` ships `src/runtime` as sources.** `copyRuntime()` copies files into the developer's project, it does not build them: the runtime lands in their `src/` as TypeScript, formatted by their prettier and checked by their tsc. Publish `dist` for the entry point and `src/runtime` for the code your module installs — the two halves are built differently on purpose.

**NestJS is a peer dependency.** Your runtime lands inside the developer's application and is instantiated by their Nest container. A bundled copy of `@nestjs/common` means two `Injectable` decorators and a provider their container cannot resolve.

And one that goes wrong silently: **`files` has to publish every file your install reads.** `copyPackageFile('docker-compose.storage.yml')` reads that file out of your package root at install time. Left out of `files`, the install fails on a machine that is not yours, having already written half of what it meant to. `module:validate` compares the two, because this one produces no symptom until someone else installs you.

## The definition imports one type

```ts
import type { ModuleDefinition } from 'heryjs';

export default {
  name: 'maintenance',
  description: 'Answer 503 while the app is in maintenance, except for admins.',
  meta: { compatibility: '>=0.0.1' },

  install(context) {
    context.copyRuntime();
    context.nextSteps(['Register MaintenanceGuard in src/app.module.ts']);
  },
} satisfies ModuleDefinition;
```

A module is its default export, and the shape is the whole contract. `satisfies` checks the object against it — `context` is typed, a misspelt `meta.compatibility` is a compile error — without widening what you wrote, so the object stays exactly the literal you can read.

The import is `import type`, which the compiler erases: your published package carries **no runtime dependency on HeryJs at all**. Nothing has to be loaded, resolved or version-matched at install time; what was checked was checked when you built.

Two fields are not in there. `name` is kebab-case, checked and refused otherwise: it becomes a directory, a package name, an npm id and the word the developer types. And there is no `dest` — your runtime lands in `src/modules/<name>`, and declaring that path yourself is refused rather than accepted, so one destination has one spelling. Declare it only if your module belongs somewhere else, the way a search driver replacing a kernel one lands in `src/technical/search`.

## Two tsconfigs, on purpose

The scaffold writes both, and they differ in one thing:

- `tsconfig.json` — `noEmit`, `include: ["src", "test"]`. What your editor, your `tsc` and your typed lint rules read. It maps `#kernel/*`, which is what lets your runtime typecheck against a kernel your package does not ship.
- `tsconfig.build.json` — emits `dist/` from `src/module.ts` alone, with `declaration`. What `prepack` runs.

Only the entry point is compiled. `src/runtime` is published as TypeScript source, because `copyRuntime` copies it into a project that compiles it itself — building it here would produce a `dist/runtime` nothing ever reads.

The build clears `dist` before it runs, and that is not tidiness. A declaration file left in `dist` is an input as far as `tsc` is concerned: `@types/node` imports `"stream"`, and that specifier resolves to a package of that name as soon as it has types to find — which is how the module named `stream` failed its own second build with *"would overwrite input file"*. Build from nothing but your sources.

`heryjs` resolves from `node_modules` like any other dependency, so nothing in either config points at it. Inside this repository the eleven official modules add a path for it, because there is no `heryjs` package to resolve — that mapping is an artefact of living in the framework's own tree, not part of the contract.

## `meta.compatibility` is checked before anything is written

```ts
meta: { compatibility: '>=0.0.1' },
```

A semver range against the kernel version of the project installing you. Out of range, the install refuses and writes nothing:

```
✖ maintenance was written for HeryJs >=0.2.0, and this project is on 0.0.1
    install it with --force if you mean to take that on
```

Declare the range you have actually tested. `*` is accepted and says nothing; the field is not optional, because the version nobody filled in is the version everybody assumed.

## What your module may and may not do

The install context is the only way to write, and there is no way around it:

| | |
|---|---|
| `copyRuntime()` | copies `src/runtime/` to `dest`, rewriting `#kernel/` on the way, skipping any file already there |
| `copyPackageFile(name)` | copies a file from your package root into the project |
| `addPrismaModels(models)` | appends models you own to the project's Prisma schema |
| `addModelFields(model, fields)` | adds columns to a Prisma model you do not own |
| `chainScript(script, command)` | appends a command to one of the root `package.json` scripts |
| `addWorkspace(directory)` | declares a directory in `pnpm-workspace.yaml` |
| `patchExactStrings(file, pairs, guard)` | exact-match replacements in a kernel file you extend |
| `nextSteps(steps)` | the closing numbered list |

That list is the whole vocabulary, and each intent appears in it once — there is no freeform edit taking the file's source and handing back a new one, and no path argument on the operations whose file the project always keeps in the same place. So what your module writes can be read without being run, which is also how `lint:module-patches` on the installing side can tell that a patch of yours has stopped applying.

Your `module.ts` never imports `node:fs`. That is checked, and it is what makes idempotence, the skip logging and the record of what was touched hold for every module rather than for the careful ones. Your **runtime** is free to touch the filesystem — writing files is the whole point of a storage module.

Two things nothing lets you do, deliberately: edit the developer's `app.module.ts` (wiring is a next step they perform where they can read it), and reach the kernel through anything but `#kernel/`, which is rewritten to their own `#technical/` as the file is copied.

## Validate before you publish

```bash
pnpm add ./hery-module-maintenance
pnpm hery module:validate maintenance
```

From a project that depends on your package, so the check runs against the module exactly as a user receives it — which is what `files` decided. It reads your `package.json` first: the `heryjs.module` marker, a `main` at JavaScript, and a `files` that publishes both `src/runtime` and whatever `main` compiles to. Then it reads the definition the way `install` does, and checks what is around it: no `node:fs` in the entry, a `src/runtime` of real files, a spec shipped with them, `#kernel/` as the only subpath import, and no relative import climbing out of the package.

Run it in your own package directory too. There it also sees your `tsconfig.json`, and asks that it map `#kernel/*` — a mapping that only matters where the module is authored, since your tsconfig is not something you publish.

The same checks run over this repository's own eleven modules in CI. What is asked of your module is asked of the official ones first.

## Ship a spec, in `src/runtime`

It is the one requirement that is about the installing project rather than about your package: `copyRuntime` copies the spec in with the code it covers, so the developer's own suite runs it. A module with no spec is a module whose installer has nothing to run.

Anything that needs a real service — an engine, a broker, a running app — belongs in `test/*.integration-spec.ts` at your package root instead. That half is not copied and not published; it is yours to run in your own CI. Put `test` in your tsconfig's `include` when you add it, which `module:validate` checks: left out, the directory is outside your project and every typed lint rule reports every file in it as one it cannot find.

## The checklist

- [ ] `heryjs.module: true` in `package.json`
- [ ] `main` at compiled JavaScript, `src/runtime` in `files`
- [ ] every file `copyPackageFile` reads also in `files`
- [ ] `@nestjs/common` as a peer dependency, `heryjs` as a dev dependency
- [ ] a `prepack` that builds, so `npm publish` cannot ship a stale `dist`
- [ ] a definition with a kebab-case `name`, a `description` and `meta.compatibility`, closed with `satisfies ModuleDefinition`
- [ ] no `dest` unless your runtime lands outside `src/modules/<name>`
- [ ] no `node:fs` in `src/module.ts`
- [ ] `#kernel/` for every kernel import, nothing relative climbing out
- [ ] a spec under `src/runtime`, and `test` in your tsconfig if you keep integration tests
- [ ] `hery module:validate <name>` green from a project that depends on you
