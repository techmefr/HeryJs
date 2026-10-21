import { BatchAtomicFailedException } from '#technical/errors/batch-atomic-failed.exception';
import { resolveDomainError } from '#technical/errors/domain-exception.filter';
import type { ResolvedError } from '#technical/errors/domain-exception.filter';

export type BatchEntry<T> =
  | { index: number; id?: string; failure: ResolvedError; run?: undefined }
  | {
      index: number;
      id?: string;
      failure?: undefined;
      run: () => Promise<T>;
    };

interface BatchResultIdentity {
  index: number;
  id?: string;
}

export type BatchResult<T> =
  | (BatchResultIdentity & { status: 'ok'; data: T })
  | (BatchResultIdentity & { status: 'error'; error: ResolvedError })
  | (BatchResultIdentity & { status: 'notApplied' });

export interface BatchSummary {
  total: number;
  succeeded: number;
  failed: number;
}

export interface BatchExecutionOptions {
  atomic: boolean;
  runAtomically: <R>(callback: () => Promise<R>) => Promise<R>;
}

export interface BatchOutcome<T> {
  results: BatchResult<T>[];
  meta: BatchSummary;
}

class AtomicAbort extends Error {
  constructor(
    readonly failedAt: number,
    readonly error: ResolvedError,
  ) {
    super('atomic batch aborted');
  }
}

function identityOf<T>(entry: BatchEntry<T>): BatchResultIdentity {
  return entry.id === undefined
    ? { index: entry.index }
    : { index: entry.index, id: entry.id };
}

function summarize<T>(results: BatchResult<T>[]): BatchSummary {
  const succeeded = results.filter((result) => result.status === 'ok').length;
  const failed = results.filter((result) => result.status === 'error').length;

  return { total: results.length, succeeded, failed };
}

async function runIndependently<T>(
  entries: BatchEntry<T>[],
): Promise<BatchResult<T>[]> {
  const results: BatchResult<T>[] = [];

  for (const entry of entries) {
    if (entry.failure) {
      results.push({
        ...identityOf(entry),
        status: 'error',
        error: entry.failure,
      });
      continue;
    }

    try {
      results.push({
        ...identityOf(entry),
        status: 'ok',
        data: await entry.run(),
      });
    } catch (error) {
      results.push({
        ...identityOf(entry),
        status: 'error',
        error: resolveDomainError(error),
      });
    }
  }

  return results;
}

function notAppliedExcept<T>(
  entries: BatchEntry<T>[],
  failures: Map<number, ResolvedError>,
): BatchResult<T>[] {
  return entries.map((entry): BatchResult<T> => {
    const failure = failures.get(entry.index);

    return failure
      ? { ...identityOf(entry), status: 'error', error: failure }
      : { ...identityOf(entry), status: 'notApplied' };
  });
}

async function runAllOrNothing<T>(
  entries: BatchEntry<T>[],
  runAtomically: BatchExecutionOptions['runAtomically'],
): Promise<BatchResult<T>[]> {
  const denied = new Map<number, ResolvedError>();

  for (const entry of entries) {
    if (entry.failure) {
      denied.set(entry.index, entry.failure);
    }
  }

  if (denied.size > 0) {
    throw new BatchAtomicFailedException(
      notAppliedExcept(entries, denied),
      denied.size,
    );
  }

  try {
    return await runAtomically(async () => {
      const results: BatchResult<T>[] = [];

      for (const entry of entries) {
        if (entry.run === undefined) {
          continue;
        }

        try {
          results.push({
            ...identityOf(entry),
            status: 'ok',
            data: await entry.run(),
          });
        } catch (error) {
          throw new AtomicAbort(entry.index, resolveDomainError(error));
        }
      }

      return results;
    });
  } catch (error) {
    if (error instanceof AtomicAbort) {
      throw new BatchAtomicFailedException(
        notAppliedExcept(entries, new Map([[error.failedAt, error.error]])),
        1,
      );
    }

    throw error;
  }
}

export async function executeBatch<T>(
  entries: BatchEntry<T>[],
  options: BatchExecutionOptions,
): Promise<BatchOutcome<T>> {
  const results = options.atomic
    ? await runAllOrNothing(entries, options.runAtomically)
    : await runIndependently(entries);

  return { results, meta: summarize(results) };
}
