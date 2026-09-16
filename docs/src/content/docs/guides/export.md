---
title: Export
description: Turn records into a downloadable file — one exportable, several formats chosen per call, and a queued path for the ones too big for a request.
---

Export is the module that made the driver convention grow a second selection mode. Mail has one active driver because nothing in a resource should decide which transport carries a message. Export has several at once, because **the format is part of what the caller asked for** — a user clicked "download as PDF" — so it belongs in the call.

```bash
pnpm hery install export
```

No migration, no environment variable. The CSV driver ships with the module and needs no dependency, no container and no credentials.

## An exportable says what to lay out, never what format it ends up in

```bash
pnpm hery make:export TaskListExport
```

That writes a class into `src/functional/<domain>/`, the domain derived from the name with a trailing `export` stripped, or named outright with `--domain`.

```ts
export class TaskListExport implements Exportable {
  readonly filename = 'task-list-export';

  readonly columns: readonly string[] = ['id', 'name'];

  rows(): ExportRow[] {
    return [];
  }
}
```

Three members: a base filename with no extension, the column order, and the rows. `rows()` may be async. **`columns` is explicit rather than derived from the first row's keys**, and that is the whole reason it exists as a field: derived columns mean an export silently loses a column the day a row happens to be missing it, and silently gains one the day someone adds a field.

A row is a `Record<string, string | number | boolean | null>` — plain records, not a generic over your model. An exporter's job is to lay out what it was handed, and giving it the model type would invite it to reach for a relation nobody serialised.

## `as(format)` chooses the driver, one call at a time

```ts
const file = await this.exports.as('pdf').generate(new TaskListExport(tasks));
// { filename: 'task-list-export.pdf', contentType: 'application/pdf', body: <Buffer …> }
```

`as()` returns a small bound object with exactly two things worth doing — `generate` and `queue`. It is a plain object rather than an injectable, because it lives for the duration of one call and carries no state the container could usefully own.

The filename comes from the exportable and the extension from the driver, so **the same `TaskListExport` serves CSV, XLSX and PDF unchanged**. Omitting the format means `export.default` from `hery.config.ts`, so a caller that genuinely does not care never has to name one:

```ts
await this.exports.as().generate(new TaskListExport(tasks));
```

`this.exports.formats` lists what is declared, which is what you hand a frontend building a format picker.

## An unknown format is a 400, not a crash

Two failures that look similar are treated very differently, on purpose.

A driver **declared in `hery.config.ts` and never installed** stops the boot, naming the install command. That is a deployment mistake, and it is found before the first request.

A format **arriving from a request** is user input. `resolve()` throws `InvalidQueryException('export.format', formats)` — a 400 listing what is available, the same treatment an unknown sort field gets. **Never pass a query parameter straight into `as()` without expecting that 400**; it is the correct answer, and your controller should let it through rather than catching it.

## Declaring formats

```ts
export: {
  default: 'csv',
  drivers: {
    csv: { driver: 'csv' },
    xlsx: { driver: 'xlsx' },
    pdf: { driver: 'pdf' },
  },
},
```

Every declared driver is resolved at boot and kept. `default` is only the fallback for `as()` being given nothing — unlike mail, it is not the only resolvable driver. Leave the slice out and you get CSV alone.

## CSV is the default driver, and it quotes everything

`CsvExportDriver` is export's counterpart to mail's log driver: a real driver with no dependency, so a freshly generated app can export something the day it boots.

It applies RFC 4180 quoting to **every** field rather than only the ones that look like they need it. Deciding per field means deciding what a separator is, and a project exporting French data through a semicolon-separated locale discovers that decision the hard way. A missing column and an explicit `null` both render as empty rather than as the words `undefined` or `null`, which are indistinguishable from real data once they are sitting in a spreadsheet cell. The file ends with a trailing CRLF, so concatenating two exports does not fuse the last row into the next header.

## XLSX and PDF install alongside it

```bash
pnpm hery install export-xlsx
pnpm hery install export-pdf
```

Both land in `src/modules/export` rather than a folder of their own — a driver may not live in a module of its own, because `.dependency-cruiser.cjs` forbids one module importing another and the driver has to reach the `ExportDriver` contract. Each ships a `@Global()` module binding its token; import it into `src/app.module.ts` and declare the format alongside `csv`.

`export-xlsx` pulls in `exceljs` and writes a single `Export` sheet. `export-pdf` pulls in `pdfkit` and lays rows out as a landscape table, **repeating the header on every page** — a table whose columns are named once is unreadable from page two on.

Be aware of what that costs and what has not been proven. Both are real dependencies with real install weight, which is exactly why they are separate packages: wanting CSV should never install a PDF engine. And **neither `exceljs` nor `pdfkit` is installed in this repository**, so both drivers are typechecked against their declared types and have never been run here. Treat the first export you produce with them as the thing that proves them.

## The queued path materialises rows now and renders later

```ts
await this.exports.as('xlsx').queue(new TaskListExport(tasks), user.id);
```

Rows are materialised in the request and rendering happens in the worker, because **rendering is the expensive half** — a spreadsheet or a PDF of ten thousand rows is what blocks a request, not the query that found them. It also keeps the job payload to plain data, which is the only thing a queue can carry.

The trade-off is real and worth naming: those rows travel through Redis. An export large enough for that to hurt wants a job that re-runs the query itself, which means a named exportable rather than an instance — the shape [import](../guides/import/) uses for the same reason.

Exports have their own queue, `heryjs-exports`, dispatched with `JobsService.dispatchTo(EXPORT_QUEUE, …)`. One queue per processor family is not tidiness: **a job on a queue whose workers do not recognise its name is not retried or dead-lettered — the worker returns and BullMQ marks it completed**, so a shared queue means one processor family silently swallowing another's jobs.

When the worker is done it sends an `export.ready` notification to the user id you passed, carrying the filename, content type, byte count, row count, and the storage key.

## A queued export without storage is degraded, not failed

The worker writes the file through the _storage contract_, resolved by token — not through the storage module, which it may not import. With no storage driver installed there is nowhere to put the bytes, so the notification goes out with a `null` key and the reason is logged once:

```
Generated task-list-export.xlsx but no storage driver is installed to keep it.
Run "pnpm hery install storage" to have exports persisted.
```

That is deliberate. The caller still learns the export finished; an app that wants the file installs [storage](../guides/storage/). Failing the job instead would make an optional module a hard dependency of an unrelated one.

## What export deliberately does not do

- **No HTTP route.** There is no `GET /export/:something`. What you expose, to whom, and behind which capability is a product decision, and `ExportService` is what you build it out of.
- **No streaming.** `generate()` returns a `Buffer`. Everything is in memory, on both the request path and the worker path.
- **No styling, no formulas, no column widths.** `Exportable` names columns and rows; anything a driver does beyond laying those out is that driver's business, and the contract has no place to express it.
- **No scheduling, no retention.** A queued export is written once and never cleaned up. Point [prune](../guides/prune/) at it or remove the objects yourself.
