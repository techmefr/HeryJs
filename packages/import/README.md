# @heryjs/import

Turn an uploaded file back into records: one contract, a CSV driver with no
dependencies, a per-row report of what was rejected, and a queued path that
notifies when a large import is done.

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/). It is
already installable from any HeryJs project, so there is nothing to add to your
`package.json`:

```bash
pnpm hery install import
```

The install copies this package's `src/runtime/` into `src/modules/import` and prints
what is left for you to wire up. From then on the code is yours: it is never
resynchronised, and updating this package does not touch what it wrote.

## What you get

Real files in your own `src/`, formatted by your prettier and checked by your
tsc, importing your kernel through `#technical/`. `ImportService` is the only
thing a caller injects:

```ts
const outcome = await this.imports
  .from('csv')
  .read(file.buffer, new TaskListImport());
```

`outcome` reports `accepted`, `rejected` and one entry per rejected row, so a
user who uploaded five hundred rows and got four hundred back can see which
hundred failed and why. Rows whose columns do not match the importable's
declared `columns` never reach your `consume` — they come back as errors.

The `csv` driver ships with the module and needs no dependency, no container and
no credentials. Other formats install alongside it and are declared under
`import.drivers` in `hery.config.ts`; `from()` picks between them per call,
because the format is a property of the file the user just uploaded.

## Documentation

- [Modules and drivers](https://techmefr.github.io/HeryJs/guides/modules/) — the convention this module follows
- [Publishing a module](https://techmefr.github.io/HeryJs/guides/publishing-a-module/) — the same contract this package satisfies

Licensed MIT, like the framework.
