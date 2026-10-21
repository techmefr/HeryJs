import { describe, expect, it } from 'vitest';
import {
  DEVTOOLS_KINDS,
  entriesPath,
  entryRow,
  entryTone,
  kindLabel,
} from './devtools';
import type { DevtoolsEntry } from './devtools';

function entry(overrides: Partial<DevtoolsEntry>): DevtoolsEntry {
  return {
    id: '1',
    kind: 'request',
    label: 'GET /tags',
    status: '200',
    durationMs: 12.345,
    requestId: null,
    detail: null,
    createdAt: '2026-10-22T10:00:00.000Z',
    ...overrides,
  };
}

describe('entriesPath', () => {
  it('asks for one kind and one page', () => {
    expect(entriesPath('slow-query', 3)).toBe(
      '/devtools/entries?kind=slow-query&page=3',
    );
  });
});

describe('kindLabel', () => {
  it('names every kind', () => {
    for (const kind of DEVTOOLS_KINDS) {
      expect(kindLabel(kind)).not.toBe('');
    }
  });
});

describe('entryTone', () => {
  it.each([
    [{ kind: 'exception', status: '500' }, 'danger'],
    [{ kind: 'mail', status: 'failed' }, 'danger'],
    [{ kind: 'slow-query', status: null }, 'warn'],
    [{ kind: 'n-plus-one', status: null }, 'warn'],
    [{ kind: 'request', status: '503' }, 'danger'],
    [{ kind: 'request', status: '404' }, 'warn'],
    [{ kind: 'request', status: '200' }, 'ok'],
    [{ kind: 'job', status: 'completed' }, 'ok'],
  ])('tones %j as %s', (overrides, tone) => {
    expect(entryTone(entry(overrides))).toBe(tone);
  });
});

describe('entryRow', () => {
  it('rounds the duration and summarises the detail', () => {
    expect(
      entryRow(
        entry({
          kind: 'n-plus-one',
          detail: { sql: 'SELECT ?', count: 7 },
        }),
      ),
    ).toEqual({
      when: '2026-10-22T10:00:00.000Z',
      label: 'GET /tags',
      status: '200',
      ms: 12.35,
      detail: 'x7',
    });
  });

  it('leaves a missing duration and detail empty', () => {
    expect(entryRow(entry({ durationMs: null, detail: null }))).toMatchObject({
      ms: null,
      detail: null,
    });
  });

  it('shows a masked recipient and an error', () => {
    expect(
      entryRow(
        entry({
          kind: 'mail',
          detail: { recipient: 'j***@example.com', error: 'refused' },
        }),
      ),
    ).toMatchObject({ detail: 'j***@example.com · refused' });
  });
});
