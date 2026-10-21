import type {
  EventConstructor,
  EventListener,
} from '#technical/events/event.types';
import { RecordingFake } from './recording-fake';
import type { RecordPredicate } from './recording-fake';

export class FakeEvents extends RecordingFake<object> {
  protected readonly label = 'an event to be dispatched';

  isCallingThrough = false;

  private readonly listeners = new Map<
    EventConstructor<object>,
    EventListener<object>[]
  >();

  get dispatched(): readonly object[] {
    return this.all;
  }

  callThrough(): void {
    this.isCallingThrough = true;
  }

  listen<TEvent extends object>(
    event: EventConstructor<TEvent>,
    listener: EventListener<TEvent>,
  ): void {
    const key = event as EventConstructor<object>;
    const registered = this.listeners.get(key) ?? [];

    registered.push(listener);
    this.listeners.set(key, registered);
  }

  async dispatch<TEvent extends object>(event: TEvent): Promise<void> {
    this.record(event);

    if (!this.isCallingThrough) {
      return;
    }

    const key = event.constructor as EventConstructor<object>;

    for (const listener of this.listeners.get(key) ?? []) {
      if (listener.isQueued !== true) {
        await listener.handle(event);
      }
    }
  }

  resolveQueued(): { listener: EventListener<object>; event: object } | null {
    return null;
  }

  assertDispatched<TEvent extends object>(
    event: EventConstructor<TEvent>,
    predicate?: (event: TEvent) => boolean,
    times?: number,
  ): void {
    this.assertRecorded(
      (candidate) => this.isMatch(candidate, event, predicate),
      times,
    );
  }

  assertNotDispatched<TEvent extends object>(
    event: EventConstructor<TEvent>,
    predicate?: (event: TEvent) => boolean,
  ): void {
    this.assertNotRecorded((candidate) =>
      this.isMatch(candidate, event, predicate),
    );
  }

  assertNothingDispatched(): void {
    this.assertNotRecorded();
  }

  override reset(): void {
    super.reset();
    this.isCallingThrough = false;
  }

  private isMatch<TEvent extends object>(
    candidate: object,
    event: EventConstructor<TEvent>,
    predicate?: (event: TEvent) => boolean,
  ): boolean {
    if (!(candidate instanceof event)) {
      return false;
    }

    return predicate ? predicate(candidate) : true;
  }
}

export type EventPredicate = RecordPredicate<object>;
