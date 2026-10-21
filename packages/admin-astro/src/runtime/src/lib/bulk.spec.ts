import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeOutcome, planBulk, runBulk } from './bulk';
import { mockDecisions, mockRow } from './resource.fixture';

const rows = [
  mockRow('a', 'A'),
  mockRow('b', 'B', { ...mockDecisions, delete: { allowed: false } }),
  mockRow('c', 'C', { ...mockDecisions, restore: { allowed: false } }),
];
const everyone = new Set(['a', 'b', 'c']);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('planning a bulk action', () => {
  it('keeps the rows the api allowed and names the ones it skips', () => {
    expect(planBulk('delete', rows, everyone, undefined)).toEqual({
      kind: 'delete',
      eligible: ['a', 'c'],
      skipped: ['b'],
    });
  });

  it('ignores ids that are no longer on the page', () => {
    expect(planBulk('delete', rows, new Set(['a', 'gone']), undefined)).toEqual(
      {
        kind: 'delete',
        eligible: ['a'],
        skipped: [],
      },
    );
  });

  it('needs both the collection and the row capability for a hard delete', () => {
    expect(
      planBulk('hardDelete', rows, everyone, { hardDelete: { allowed: true } })
        .eligible,
    ).toEqual(['a', 'c']);
    expect(planBulk('hardDelete', rows, everyone, undefined).eligible).toEqual(
      [],
    );
    expect(
      planBulk('hardDelete', rows, everyone, { hardDelete: { allowed: false } })
        .skipped,
    ).toEqual(['a', 'b', 'c']);
  });

  it('plans a restore from the restore capability', () => {
    expect(planBulk('restore', rows, everyone, undefined).eligible).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('running a bulk action', () => {
  it('sends nothing when nothing is eligible', async () => {
    const sent = vi.fn();
    vi.stubGlobal('fetch', sent);

    const outcome = await runBulk('/blog-posts', {
      kind: 'delete',
      eligible: [],
      skipped: ['b'],
    });

    expect(sent).not.toHaveBeenCalled();
    expect(outcome).toEqual({ succeeded: [], failed: [], skipped: ['b'] });
  });

  it('reports a partial failure per record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          status: 201,
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                { index: 0, id: 'a', status: 'ok', data: null },
                {
                  index: 1,
                  id: 'c',
                  status: 'error',
                  error: {
                    status: 404,
                    key: 'record.not_found',
                    message: 'Gone',
                  },
                },
              ],
              messages: [],
            }),
        }),
      ),
    );

    const outcome = await runBulk('/blog-posts', {
      kind: 'delete',
      eligible: ['a', 'c'],
      skipped: ['b'],
    });

    expect(outcome).toEqual({
      succeeded: ['a'],
      failed: [{ id: 'c', message: 'Gone' }],
      skipped: ['b'],
    });
  });
});

describe('describing an outcome', () => {
  it('is calm when everything went through', () => {
    expect(
      describeOutcome('deleted', {
        succeeded: ['a', 'b'],
        failed: [],
        skipped: [],
      }),
    ).toEqual({ message: '2 deleted', isError: false });
  });

  it('spells out what was refused and skipped', () => {
    const report = describeOutcome('deleted', {
      succeeded: ['a'],
      failed: [{ id: 'c', message: 'Gone' }],
      skipped: ['b'],
    });

    expect(report.isError).toBe(true);
    expect(report.message).toBe(
      '1 deleted, 1 refused (c: Gone), 1 skipped, not permitted',
    );
  });
});
