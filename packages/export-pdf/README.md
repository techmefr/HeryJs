# @heryjs/export-pdf

Export to a paginated PDF table through pdfkit, as an export driver

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/). It is
already installable from any HeryJs project, so there is nothing to add to your
`package.json`:

```bash
pnpm hery install export-pdf
```

The install copies this package's `src/runtime/` into `src/modules/export` and prints
what is left for you to wire up. From then on the code is yours: it is never
resynchronised, and updating this package does not touch what it wrote.

## What you get

`PdfExportDriver`, an `ExportDriver` binding the `pdf` token, landing next to the
export module it extends. Declare it alongside `csv` in `hery.config.ts` and ask
for it per call:

```ts
await this.exports.as('pdf').generate(new TaskListExport(tasks));
```

Rows are laid out as a landscape table, one page after another, with the header
repeated on each. The exportable itself is unchanged — it names its columns and
rows, never its format.

## Documentation

- [Modules and drivers](https://techmefr.github.io/HeryJs/guides/modules/) — the contract this driver satisfies
- [Publishing a module](https://techmefr.github.io/HeryJs/guides/publishing-a-module/) — the same contract this package satisfies

Licensed MIT, like the framework.
