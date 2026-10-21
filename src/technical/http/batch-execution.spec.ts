import { BatchAtomicFailedException } from '#technical/errors/batch-atomic-failed.exception';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import { resolveDomainError } from '#technical/errors/domain-exception.filter';
import { executeBatch } from './batch-execution';
import type { BatchEntry } from './batch-execution';

const passthrough = <R>(callback: () => Promise<R>): Promise<R> => callback();

function countingRunner() {
  const state = { calls: 0 };

  return {
    state,
    runAtomically: <R>(callback: () => Promise<R>): Promise<R> => {
      state.calls += 1;
      return callback();
    },
  };
}

function succeeds(index: number, data: string): BatchEntry<string> {
  return { index, id: `id-${index}`, run: () => Promise.resolve(data) };
}

function throws(index: number): BatchEntry<string> {
  return {
    index,
    id: `id-${index}`,
    run: () => Promise.reject(new RecordNotFoundException('note')),
  };
}

function denied(index: number): BatchEntry<string> {
  return {
    index,
    id: `id-${index}`,
    failure: resolveDomainError(new RecordNotFoundException('note')),
  };
}

describe('executeBatch', () => {
  describe('independent entries', () => {
    it('reports each entry on its own and counts them', async () => {
      const { results, meta } = await executeBatch(
        [succeeds(0, 'a'), throws(1), denied(2), succeeds(3, 'd')],
        { atomic: false, runAtomically: passthrough },
      );

      expect(results.map((result) => result.status)).toEqual([
        'ok',
        'error',
        'error',
        'ok',
      ]);
      expect(meta).toEqual({ total: 4, succeeded: 2, failed: 2 });
    });

    it('leaves the id off an entry that never had one', async () => {
      const { results } = await executeBatch(
        [{ index: 0, run: () => Promise.resolve('created') }],
        { atomic: false, runAtomically: passthrough },
      );

      expect(results[0]).toEqual({ index: 0, status: 'ok', data: 'created' });
    });

    it('never opens a transaction', async () => {
      const runner = countingRunner();

      await executeBatch([succeeds(0, 'a')], {
        atomic: false,
        runAtomically: runner.runAtomically,
      });

      expect(runner.state.calls).toBe(0);
    });
  });

  describe('atomic entries', () => {
    it('runs every entry inside one transaction and counts them all as succeeded', async () => {
      const runner = countingRunner();

      const { results, meta } = await executeBatch(
        [succeeds(0, 'a'), succeeds(1, 'b')],
        { atomic: true, runAtomically: runner.runAtomically },
      );

      expect(runner.state.calls).toBe(1);
      expect(results.map((result) => result.status)).toEqual(['ok', 'ok']);
      expect(meta).toEqual({ total: 2, succeeded: 2, failed: 0 });
    });

    it('writes nothing and lists every denied entry when any entry was denied up front', async () => {
      const runner = countingRunner();
      const run = jest.fn(() => Promise.resolve('a'));

      const failure = executeBatch(
        [{ index: 0, id: 'id-0', run }, denied(1), denied(2)],
        { atomic: true, runAtomically: runner.runAtomically },
      );

      await expect(failure).rejects.toBeInstanceOf(BatchAtomicFailedException);
      await failure.catch((error: BatchAtomicFailedException) => {
        expect(error.getStatus()).toBe(422);
        expect(error.key).toBe('batch.atomicFailed');
        expect(
          (error.details as { results: { status: string }[] }).results.map(
            (result) => result.status,
          ),
        ).toEqual(['notApplied', 'error', 'error']);
      });
      expect(run).not.toHaveBeenCalled();
      expect(runner.state.calls).toBe(0);
    });

    it('aborts at the first failing entry, skips the rest and reports where it failed', async () => {
      const later = jest.fn(() => Promise.resolve('c'));

      const failure = executeBatch(
        [succeeds(0, 'a'), throws(1), { index: 2, id: 'id-2', run: later }],
        { atomic: true, runAtomically: passthrough },
      );

      await failure.catch((error: BatchAtomicFailedException) => {
        const details = error.details as {
          results: { status: string; error?: { status: number } }[];
          summary: { total: number; succeeded: number; failed: number };
        };

        expect(details.results.map((result) => result.status)).toEqual([
          'notApplied',
          'error',
          'notApplied',
        ]);
        expect(details.results[1]!.error!.status).toBe(404);
        expect(details.summary).toEqual({ total: 3, succeeded: 0, failed: 1 });
      });
      expect(later).not.toHaveBeenCalled();
    });

    it('lets a failure of the transaction itself through unchanged', async () => {
      await expect(
        executeBatch([succeeds(0, 'a')], {
          atomic: true,
          runAtomically: () => Promise.reject(new Error('commit failed')),
        }),
      ).rejects.toThrow('commit failed');
    });

    it('accepts an empty batch', async () => {
      const { results, meta } = await executeBatch([], {
        atomic: true,
        runAtomically: passthrough,
      });

      expect(results).toEqual([]);
      expect(meta).toEqual({ total: 0, succeeded: 0, failed: 0 });
    });
  });
});
