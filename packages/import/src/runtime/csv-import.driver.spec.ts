import type { ImportRow } from '#kernel/import/import-driver';
import { CsvImportDriver } from './csv-import.driver';

const driver = new CsvImportDriver();

function parse(csv: string): Promise<ImportRow[]> {
  return driver.parse(Buffer.from(csv, 'utf8'));
}

describe('CsvImportDriver', () => {
  it('reads the header as the column names', async () => {
    expect(await parse('id,name\r\n1,Ada\r\n')).toEqual([
      { id: '1', name: 'Ada' },
    ]);
  });

  it('returns nothing for an empty file', async () => {
    expect(await parse('')).toEqual([]);
  });

  it('returns nothing for a header with no data rows', async () => {
    expect(await parse('id,name\r\n')).toEqual([]);
  });

  /**
   * The three things a split on commas gets wrong, and the reason the parser
   * is a state machine: a quoted field may hold the separator, the quote
   * character and a line break.
   */
  it('keeps a comma inside a quoted field', async () => {
    expect(await parse('id,city\r\n1,"Paris, France"\r\n')).toEqual([
      { id: '1', city: 'Paris, France' },
    ]);
  });

  it('reads a doubled quote as one literal quote', async () => {
    expect(await parse('id,size\r\n1,"5"" nail"\r\n')).toEqual([
      { id: '1', size: '5" nail' },
    ]);
  });

  it('keeps a newline inside a quoted field', async () => {
    expect(await parse('id,address\r\n1,"12 rue X\r\nParis"\r\n')).toEqual([
      { id: '1', address: '12 rue X\nParis' },
    ]);
  });

  it('reads a field that is only a quoted quote', async () => {
    expect(await parse('id,mark\r\n1,""""\r\n')).toEqual([
      { id: '1', mark: '"' },
    ]);
  });

  it('accepts unix line endings', async () => {
    expect(await parse('id,name\n1,Ada\n2,Grace\n')).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Grace' },
    ]);
  });

  it('keeps the last row when the file has no trailing newline', async () => {
    expect(await parse('id,name\r\n1,Ada')).toEqual([{ id: '1', name: 'Ada' }]);
  });

  it('strips a byte order mark from the first column name', async () => {
    expect(await parse('﻿id,name\r\n1,Ada\r\n')).toEqual([
      { id: '1', name: 'Ada' },
    ]);
  });

  /**
   * Export writes null as an empty field, so reading an empty field back as
   * "" would turn every absent value into a present one on the round trip.
   */
  it('reads an empty field as null, quoted or not', async () => {
    expect(await parse('id,name,note\r\n1,,""\r\n')).toEqual([
      { id: '1', name: null, note: null },
    ]);
  });

  /**
   * A short record is padded rather than left with missing keys, so it is
   * rejected later for the values it holds and not for a shape problem the
   * file does not have.
   */
  it('pads a record shorter than the header with nulls', async () => {
    expect(await parse('id,name,note\r\n1,Ada\r\n')).toEqual([
      { id: '1', name: 'Ada', note: null },
    ]);
  });

  it('round-trips what the csv export driver writes', async () => {
    const exported = '"id","name"\r\n"1","Paris, ""France"""\r\n';

    expect(await parse(exported)).toEqual([
      { id: '1', name: 'Paris, "France"' },
    ]);
  });
});
