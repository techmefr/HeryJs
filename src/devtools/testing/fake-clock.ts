type RealApi =
  | 'hrtime'
  | 'nextTick'
  | 'performance'
  | 'queueMicrotask'
  | 'requestAnimationFrame'
  | 'cancelAnimationFrame'
  | 'requestIdleCallback'
  | 'cancelIdleCallback'
  | 'setImmediate'
  | 'clearImmediate'
  | 'setInterval'
  | 'clearInterval'
  | 'setTimeout'
  | 'clearTimeout';

const REAL_APIS: RealApi[] = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
];

export type ClockInstant = Date | number | string;

export class FakeClock {
  isFrozen = false;

  freeze(at: ClockInstant = new Date()): void {
    jest.useFakeTimers({ now: new Date(at), doNotFake: REAL_APIS });
    this.isFrozen = true;
  }

  set(at: ClockInstant): void {
    if (!this.isFrozen) {
      this.freeze(at);
      return;
    }

    jest.setSystemTime(new Date(at));
  }

  travel(milliseconds: number): void {
    if (!this.isFrozen) {
      this.freeze();
    }

    jest.setSystemTime(Date.now() + milliseconds);
  }

  now(): Date {
    return new Date();
  }

  restore(): void {
    if (!this.isFrozen) {
      return;
    }

    jest.useRealTimers();
    this.isFrozen = false;
  }
}
