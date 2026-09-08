# hery-module-maintenance

A complete community module, kept here to be read. It answers `503` while
`MAINTENANCE_ENABLED=true`, and lets admins through.

It is deliberately the smallest module that still exercises every part of the
contract: a definition, a runtime of real files, a kernel import, an exception
that goes through the project's own filter, a spec that ships with the code, and
a declared compatibility range.

```
package.json          the heryjs.module marker, files, the compiled entry
tsconfig.json         #kernel/* pointed at the kernel, for authoring
tsconfig.build.json   what "pnpm build" emits: the definition only
src/module.ts         the definition -- imports nothing from HeryJs
src/runtime/          the guard, its module, its exception, and its spec
```

## It is not installed here

`examples/` is not a pnpm workspace, so nothing links this package and
`hery install maintenance` will not find it: the community channel is any npm
package a project *depends on* that carries the `heryjs.module` marker. To try
it against a real project:

```bash
pnpm add ./examples/hery-module-maintenance
pnpm hery module:validate maintenance
pnpm hery install maintenance
```

## What still runs against it

- `pnpm run typecheck:packages` type-checks it against the kernel
- `pnpm test` runs `src/runtime/maintenance.guard.spec.ts`, where it is written
- `cli/lib/module-example.spec.ts` loads this definition the way the CLI does
  and puts it through `hery module:validate`'s own checks

## Two things a standalone module would do differently

Both tsconfigs extend this repository's, and `#kernel/*` points at
`../../src/technical`. A module living in its own repository inlines those
compiler options and points `#kernel/*` at its `heryjs` devDependency.

`install(context)` types its argument structurally, listing only the two
methods it calls. A published `heryjs` would export `InstallContext` for it to
import — see the publishing guide for where that stands.
