/**
 * An event is a class carrying data and nothing else, and its constructor is
 * the subscription key -- not a string, and not a token declared beside it.
 *
 * A string key (`dispatch('user.registered')`) makes a rename a silent
 * no-op: the dispatcher still accepts the old string, no listener matches it
 * any more, and the feature that used to react simply stops reacting, with
 * no error anywhere. A separate token per event has the same failure in a
 * slower form -- the token and the payload type drift apart and nothing
 * checks that the listener reads the shape the dispatcher wrote.
 *
 * The constructor is the one key that cannot drift: `listen(UserRegistered,
 * ...)` ties the subscription, the payload type and the class rename
 * together, so renaming or deleting the event is a compile error at every
 * listener instead of a dead subscription discovered in production.
 */
export type EventConstructor<TEvent extends object> = new (
  // Deliberately unconstrained: an event class is free to take whatever
  // constructor arguments it likes, since the bus only ever receives
  // instances and never constructs one itself.
  ...args: never[]
) => TEvent;

export interface EventListener<TEvent extends object> {
  /**
   * Stable across deploys: it is what a queued job carries to find this
   * listener again in the worker process. Renaming it while jobs are already
   * enqueued strands those jobs, so treat it as data, not as a label.
   */
  readonly name: string;
  readonly isQueued?: boolean;
  handle(event: TEvent): Promise<void> | void;
}

export interface EventDispatchJobData extends Record<string, unknown> {
  eventName: string;
  listenerName: string;
  payload: Record<string, unknown>;
  /**
   * Null only when the event was dispatched outside any request (a CLI
   * backfill, a boot-time hook). The worker does not invent a tenant for it:
   * see events.processor.ts.
   */
  tenantId: string | null;
}

export const EVENT_DISPATCH_JOB = 'event.dispatch';
