import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBlueprint } from './blueprint';

function load(yaml: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hery-erasure-'));
  const file = path.join(dir, 'note.yaml');

  writeFileSync(file, yaml);

  return () => loadBlueprint(file);
}

describe('a blueprint declaring how its rows are erased', () => {
  it('accepts an anonymising erasure with a personal field', () => {
    const blueprint = load(`
name: Note
erasure: anonymise
fields:
  - name: body
    type: string
    personal: true
`)();

    expect(blueprint.erasure).toBe('anonymise');
  });

  it('accepts a deleting erasure with no personal field', () => {
    expect(
      load(`
name: Note
erasure: delete
fields:
  - name: body
    type: string
`)().erasure,
    ).toBe('delete');
  });

  it('refuses a personal field with no erasure', () => {
    expect(
      load(`
name: Note
fields:
  - name: body
    type: string
    personal: true
`),
    ).toThrow(/needs the blueprint to declare an erasure/);
  });

  it('refuses an anonymising erasure with nothing personal to rewrite', () => {
    expect(
      load(`
name: Note
erasure: anonymise
fields:
  - name: body
    type: string
`),
    ).toThrow(/at least one personal field/);
  });

  it('refuses personal fields on a deleting erasure', () => {
    expect(
      load(`
name: Note
erasure: delete
fields:
  - name: body
    type: string
    personal: true
`),
    ).toThrow(/only apply to erasure: anonymise/);
  });

  it('refuses an erasure on an unrouted resource', () => {
    expect(
      load(`
name: Note
routed: false
erasure: delete
fields:
  - name: body
    type: string
`),
    ).toThrow(/routed resource/);
  });

  it('makes a slug personal when the field it comes from is', () => {
    const blueprint = load(`
name: Note
erasure: anonymise
fields:
  - name: title
    type: string
    personal: true
  - name: handle
    type: slug
    source: title
`)();

    expect(
      blueprint.fields.find((field) => field.name === 'handle')?.personal,
    ).toBe(true);
  });

  it('refuses a slug declared not personal when its source is', () => {
    expect(
      load(`
name: Note
erasure: anonymise
fields:
  - name: title
    type: string
    personal: true
  - name: handle
    type: slug
    source: title
    personal: false
`),
    ).toThrow(/cannot be declared personal: false/);
  });
});
