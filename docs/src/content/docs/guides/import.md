---
title: Import
description: Turn an uploaded file back into records, with a per-row report of what was rejected and why.
---

Import is [export](../guides/export/) run backwards, and deliberately the same four pieces: a contract in the kernel, a registry in the module, a facade you inject, and a zero-config CSV driver. Selection is per call for the same reason — **the format is a property of the file the user just uploaded**, not of the deployment.

```bash
pnpm hery install import
```

No migration, no environment variable, no dependency. What import adds that export does not is the part that matters: an outcome you can show a user.

## An importable names its columns and consumes its rows

```ts
export class TaskListImport implements Importable {
  readonly name = 'TaskListImport';

  readonly columns: readonly string[] = ['id', 'name'];

  async consume(rows: ImportRow[]): Promise<ImportOutcome> {
    // rows already match `columns`; reject what your domain refuses
    return { accepted: rows.length, rejected: 0, errors: [] };
  }
}
```

Three members. `columns` declares what the file must carry, `consume` does whatever the domain means by importing, and `name` is the key the importable binds under so a queued import can name it across a process boundary.

`columns` is explicit for exactly the reason `Exportable.columns` is: derived from the first row's keys, **a file missing a column would import as though that column had never been required**, and a file carrying an extra one would pass unnoticed into whatever `consume` does with it.

There is no `hery make:import` command. `make:mail` and `make:export` exist; this one does not, despite the module's own next steps mentioning it — write the class by hand until it does.

## `from(format)` reads, and reports what it could not

```ts
const outcome = await this.imports
  .from('csv')
  .read(file.buffer, new TaskListImport());
```

```ts
{
  accepted: 412,
  rejected: 88,
  errors: [{ row: 17, column: 'name', message: 'Column "name" is declared by the import but absent from the file.' }, …]
}
```

An import is partially successful far more often than it is either, so the outcome is a report rather than a boolean or a thrown exception. **Throwing on the first bad row makes a thousand-row file take a thousand uploads to fix**, and returning only a count makes the user guess which rows were the problem.

`accepted` and `rejected` are counted separately rather than derived from `errors.length`, because several errors can land on one row and a caller showing "412 of 500 rows imported" must not have that number quietly drift with the number of complaints. `row` is 1-based over the data rows, so it matches what a spreadsheet shows.

Omitting the format means `import.default` from `hery.config.ts`, so an upload endpoint that only ever accepts one kind of file never names one. An unknown format arriving with an upload is user input, so it is a 400 listing what is accepted — not a crash, which is what a driver declared in config and never installed gets, at boot, long before any request.

## Rows that do not match the declared columns never reach `consume`

`partitionRows` is the gate between the parsed file and your importable, and it checks **both directions**. A missing column is the obvious mistake. An extra one is the expensive one, because that is what a renamed header looks like: the file still parses, the intended column arrives empty, and the import quietly blanks a field across every row.

A row failing that check is neither dropped nor handed on. Dropping it leaves the user with a success message and fewer records than they uploaded; handing it on makes every `consume` re-derive the same shape check against whatever the driver happened to produce. It comes back as an error instead, and its rejection is merged into the count your `consume` reported — which is what lets a caller trust that accepted plus rejected equals the number of rows the file actually held.

So inside `consume`, the rows you get already match `columns` and you may read them directly. Everything you still reject — a duplicate key, a value the domain refuses — you report through your own `ImportOutcome`.

## The CSV driver is a state machine, not a split

`CsvImportDriver` parses character by character rather than splitting on commas and newlines. **Splitting works on every sample file anyone writes by hand and fails on the first real one**, because a quoted field is allowed to contain the separator, the quote character and a line break — and an address column contains all three.

Three behaviours are chosen to keep a round trip through export and back honest:

- An empty cell becomes `null`, not `''`. The export driver writes `null` as an empty field, so reading it back as an empty string would turn every absent value into a present one.
- A record shorter than the header is filled with nulls rather than left with missing keys, so it is not rejected for a shape problem the file does not actually have.
- A last line with no terminator still produces a record. Dropping it loses the final row of every export produced by a tool that omits the trailing newline.

A leading BOM is stripped, and `\r\n` inside a quoted field is normalised to `\n` so a file written on Windows and one written on Unix produce the same value.

## Declaring formats

```ts
import: {
  default: 'csv',
  drivers: {
    csv: { driver: 'csv' },
  },
},
```

Same registry, same boot-time failure, same install-command message as every other module. **There is no `import-xlsx` package today**, despite the module's next steps suggesting one — CSV is what ships, and a second driver is an `ImportDriver` and a token away.

## The queued path travels as a name, not as a closure

```ts
await this.imports
  .from('csv')
  .queue(file.buffer, new TaskListImport(), user.id);
```

Parsing happens in the worker, because parsing is the expensive half — a hundred-thousand-row spreadsheet is what blocks a request, not the upload that delivered it. Same split export makes, from the other end, and the same trade-off: **the file travels through Redis as base64**. An upload large enough for that to hurt wants to be written to [storage](../guides/storage/) first and the job given its key.

Export's queued path can rebuild everything it needs from plain data, because rendering lives on the driver. Import's cannot: `consume` is your application code, and no queue carries a closure. So the job carries the importable's `name`, and the worker looks the instance up through the same global symbol registry the drivers use. That means **you must bind the importable yourself**, in the module that dispatches it:

```ts
providers: [
  TaskListImport,
  { provide: importableToken('TaskListImport'), useExisting: TaskListImport },
],
```

Without that binding, the job does not fail — it logs and returns:

```
Queued import named "TaskListImport" but nothing is bound under
importableToken("TaskListImport"). Provide the importable in the module that
dispatches it.
```

Imports have their own queue, `heryjs-imports`. One queue per processor family, for the reason exports have theirs: a job on a queue whose workers do not recognise its name is marked completed rather than retried.

When the worker finishes it sends an `import.done` notification carrying the row count, the accepted and rejected counts, and every error. **That notification goes out whether or not every row landed** — an import that rejected half a file still finished, and telling the user only about the successes is how a missing record gets discovered a month later by the person who needed it.

## What import deliberately does not do

- **No HTTP route, and no upload handling.** Import takes a `Buffer`. Getting one out of a multipart request — and deciding who may — is yours, and [storage](../guides/storage/)'s upload route is a reasonable place to look for the gates.
- **No transaction around `consume`.** Whether a partially-accepted file rolls back is a domain decision, and the contract does not take it for you.
- **No type coercion.** A parser reports what the cell held, not what your model wants it to be; widening a column into a domain type is the importable's job, where the domain is actually known.
- **No dry-run mode, no idempotency key, no duplicate detection.** `consume` sees the rows; recognising one it already imported is up to it.
