import { RecordingFake } from './recording-fake';

export type RecordedLockOutcome = 'acquired' | 'contended' | 'released';

export interface RecordedLock {
  name: string;
  outcome: RecordedLockOutcome;
}

export interface FakeLockHandle {
  release(): Promise<void>;
  stopRenewing(): void;
}

export class FakeLocks extends RecordingFake<RecordedLock> {
  protected readonly label = 'a lock event';

  private readonly held = new Set<string>();

  get heldNames(): string[] {
    return [...this.held];
  }

  hold(name: string): void {
    this.held.add(name);
  }

  free(name: string): void {
    this.held.delete(name);
  }

  acquire(name: string): Promise<FakeLockHandle | null> {
    if (this.held.has(name)) {
      this.record({ name, outcome: 'contended' });

      return Promise.resolve(null);
    }

    this.held.add(name);
    this.record({ name, outcome: 'acquired' });

    return Promise.resolve(this.handleFor(name));
  }

  async runExclusively(
    name: string,
    fn: () => Promise<void> | void,
  ): Promise<'ran' | 'skipped'> {
    const lock = await this.acquire(name);

    if (!lock) {
      return 'skipped';
    }

    try {
      await fn();
      return 'ran';
    } finally {
      await lock.release();
    }
  }

  assertAcquired(name: string, times?: number): void {
    this.assertRecorded(
      (lock) => lock.name === name && lock.outcome === 'acquired',
      times,
    );
  }

  assertNotAcquired(name: string): void {
    this.assertNotRecorded(
      (lock) => lock.name === name && lock.outcome === 'acquired',
    );
  }

  assertContended(name: string, times?: number): void {
    this.assertRecorded(
      (lock) => lock.name === name && lock.outcome === 'contended',
      times,
    );
  }

  assertReleased(name: string): void {
    this.assertRecorded(
      (lock) => lock.name === name && lock.outcome === 'released',
    );
  }

  override reset(): void {
    super.reset();
    this.held.clear();
  }

  private handleFor(name: string): FakeLockHandle {
    let isReleased = false;

    return {
      release: () => {
        if (!isReleased) {
          isReleased = true;
          this.held.delete(name);
          this.record({ name, outcome: 'released' });
        }

        return Promise.resolve();
      },
      stopRenewing: () => {
        isReleased = true;
      },
    };
  }
}
