# @heryjs/export-xlsx

Export to a real spreadsheet through exceljs, as an export driver

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/). It is
already installable from any HeryJs project, so there is nothing to add to your
`package.json`:

```bash
pnpm hery install export-xlsx
```

The install copies this package's `src/runtime/` into `src/modules/export` and prints
what is left for you to wire up. From then on the code is yours: it is never
resynchronised, and updating this package does not touch what it wrote.

## What you get

`XlsxExportDriver`, an `ExportDriver` binding the `xlsx` token, landing next to
the export module it extends. Declare it alongside `csv` in `hery.config.ts` and
ask for it per call:

```ts
await this.exports.as('xlsx').generate(new TaskListExport(tasks));
```

The exportable itself is unchanged — it names its columns and rows, never its
format.

## Documentation

- [Modules and drivers](https://techmefr.github.io/HeryJs/guides/modules/) — the contract this driver satisfies
- [Publishing a module](https://techmefr.github.io/HeryJs/guides/publishing-a-module/) — the same contract this package satisfies

Licensed MIT, like the framework.
