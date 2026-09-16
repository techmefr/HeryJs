import { Injectable } from '@nestjs/common';
import type { ImportDriver, ImportRow } from '#kernel/import/import-driver';

const BOM = '﻿';

/**
 * Import's zero-config default, and the exact counterpart of
 * `CsvExportDriver`: a real driver that needs no dependency, no container and
 * no credentials, so a freshly generated app can accept a file the day it
 * boots.
 *
 * The parser is a character state machine rather than a split on commas and
 * newlines. Splitting works on every sample file anyone writes by hand and
 * fails on the first real one, because a quoted field is allowed to contain
 * the separator, the quote character and a line break -- and an address column
 * contains all three.
 */
@Injectable()
export class CsvImportDriver implements ImportDriver {
  readonly extension = 'csv';
  readonly contentType = 'text/csv; charset=utf-8';

  // The contract is async because a driver may have to reach a library that
  // streams; this one parses in memory and has nothing to await, so it resolves
  // rather than pretending otherwise with an idle `async`.
  parse(body: Buffer): Promise<ImportRow[]> {
    return Promise.resolve(this.rowsFrom(body));
  }

  private rowsFrom(body: Buffer): ImportRow[] {
    const records = parseRecords(body.toString('utf8'));
    const header = records[0];

    if (!header) {
      return [];
    }

    return records.slice(1).map((record) => toRow(header, record));
  }
}

function toRow(header: string[], record: string[]): ImportRow {
  const row: ImportRow = {};

  header.forEach((column, index) => {
    row[column] = cell(record[index]);
  });

  return row;
}

/**
 * An empty cell becomes null rather than an empty string, and a record shorter
 * than the header is filled with nulls rather than left with missing keys. Both
 * keep the round trip honest: the export driver writes null as an empty field,
 * so reading that field back as `''` would turn every absent value into a
 * present one, and a row whose keys are missing would be rejected for a shape
 * problem the file does not actually have.
 */
function cell(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

function parseRecords(input: string): string[][] {
  const text = input.startsWith(BOM) ? input.slice(BOM.length) : input;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;

  const endField = (): void => {
    record.push(field);
    field = '';
  };

  const endRecord = (): void => {
    endField();
    records.push(record);
    record = [];
  };

  while (index < text.length) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote; a single
        // one closes the field. Reading only the first of the pair is how a
        // value like 5" turns into an unterminated field that swallows the
        // rest of the file.
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }

        quoted = false;
        index += 1;
        continue;
      }

      // Line endings inside a quoted field are data, and are normalised so a
      // file written on Windows and one written on Unix produce the same value.
      if (char === '\r') {
        field += '\n';
        index += text[index + 1] === '\n' ? 2 : 1;
        continue;
      }

      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
      index += 1;
      continue;
    }

    if (char === ',') {
      endField();
      index += 1;
      continue;
    }

    if (char === '\n' || char === '\r') {
      endRecord();
      index += char === '\r' && text[index + 1] === '\n' ? 2 : 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // Only a genuinely empty tail is dropped. A file whose last line has no
  // terminator still carries a record, and discarding it loses the last row of
  // every export produced by a tool that omits the trailing newline.
  if (field !== '' || record.length > 0) {
    endRecord();
  }

  return records;
}
