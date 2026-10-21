import { FakeAssertionError } from './fake-assertion.error';

export type RecordPredicate<T> = (record: T) => boolean;

const DEFAULT_WAIT_TIMEOUT_MS = 2000;
const WAIT_POLL_INTERVAL_MS = 20;

function describeRecords(records: readonly unknown[]): string {
  return records.length === 0
    ? 'nothing was recorded'
    : `recorded: ${JSON.stringify(records)}`;
}

export abstract class RecordingFake<T> {
  private readonly records: T[] = [];

  protected abstract readonly label: string;

  get all(): readonly T[] {
    return this.records;
  }

  reset(): void {
    this.records.length = 0;
  }

  matching(predicate?: RecordPredicate<T>): T[] {
    return predicate ? this.records.filter(predicate) : [...this.records];
  }

  protected record(item: T): void {
    this.records.push(item);
  }

  protected assertRecorded(
    predicate?: RecordPredicate<T>,
    times?: number,
  ): void {
    const count = this.matching(predicate).length;
    const isMatch = times === undefined ? count > 0 : count === times;

    if (isMatch) {
      return;
    }

    const expected = times === undefined ? 'at least once' : `${times} time(s)`;

    throw new FakeAssertionError(
      `Expected ${this.label} ${expected} but it happened ${count} time(s); ${describeRecords(this.records)}`,
    );
  }

  protected assertNotRecorded(predicate?: RecordPredicate<T>): void {
    const count = this.matching(predicate).length;

    if (count === 0) {
      return;
    }

    throw new FakeAssertionError(
      `Expected ${this.label} not to happen but it happened ${count} time(s); ${describeRecords(this.records)}`,
    );
  }

  protected async waitForRecorded(
    predicate?: RecordPredicate<T>,
    timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const [found] = this.matching(predicate);

      if (found !== undefined) {
        return found;
      }

      if (Date.now() >= deadline) {
        throw new FakeAssertionError(
          `Timed out after ${timeoutMs}ms waiting for ${this.label}; ${describeRecords(this.records)}`,
        );
      }

      await new Promise<void>((resolve) =>
        setTimeout(resolve, WAIT_POLL_INTERVAL_MS),
      );
    }
  }
}
