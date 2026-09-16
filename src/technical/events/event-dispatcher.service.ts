import { Injectable, Logger } from '@nestjs/common';
import { EVENTS_QUEUE } from '#technical/jobs/jobs.constants';
import { JobsService } from '#technical/jobs/jobs.service';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { EVENT_DISPATCH_JOB } from './event.types';
import type {
  EventConstructor,
  EventDispatchJobData,
  EventListener,
} from './event.types';

/**
 * The one seam that lets a feature react to another without importing it.
 * `.dependency-cruiser.cjs` forbids functional/ -> functional/ and module ->
 * module imports outright, so before this existed the only way to run
 * something after a registration was to call it from the registration code,
 * which is exactly the edge the rule refuses. A dispatcher in the kernel is
 * reachable from both sides without either knowing the other exists.
 *
 * A caller dispatches; it never learns whether anyone is listening, how many
 * are, or which of them run in-process and which go through the queue. That
 * asymmetry is the whole point -- moving a listener to the queue must be a
 * one-flag change in the listener, with no diff at any dispatch site.
 */
@Injectable()
export class EventDispatcher {
  private readonly logger = new Logger('Events');

  private readonly listeners = new Map<
    EventConstructor<object>,
    EventListener<object>[]
  >();

  /**
   * The bridge back from a queue job to a constructor key. A job can only
   * carry strings, so the class name is what crosses the process boundary --
   * registered here, at listen() time, so nothing but an event with a live
   * listener is ever resolvable.
   */
  private readonly constructorsByName = new Map<
    string,
    EventConstructor<object>
  >();

  constructor(private readonly jobs: JobsService) {}

  listen<TEvent extends object>(
    event: EventConstructor<TEvent>,
    listener: EventListener<TEvent>,
  ): void {
    const key = event as EventConstructor<object>;
    const registered = this.listeners.get(key) ?? [];

    registered.push(listener);
    this.listeners.set(key, registered);
    this.constructorsByName.set(event.name, key);
  }

  /**
   * Failure policy: every listener runs, then every failure is rethrown
   * together as an AggregateError.
   *
   * Stopping at the first throw would make an unrelated listener's bug
   * silently cancel the ones registered after it -- an ordering dependency
   * nobody declared. Swallowing the throw is worse: the listener that was
   * supposed to send the welcome mail fails forever and the only trace is
   * the mail that never arrives. So: no listener is skipped because of
   * another, each failure is logged where it happened, and the dispatch site
   * still learns that something went wrong.
   *
   * Queued listeners are outside this: their failures belong to BullMQ,
   * which retries them. Enqueueing is all this method awaits for them.
   */
  async dispatch<TEvent extends object>(event: TEvent): Promise<void> {
    const key = event.constructor as EventConstructor<object>;
    const listeners = this.listeners.get(key) ?? [];
    const failures: Error[] = [];

    for (const listener of listeners) {
      try {
        if (listener.isQueued === true) {
          await this.enqueue(event, listener);
          continue;
        }

        await listener.handle(event);
      } catch (error) {
        const failure =
          error instanceof Error ? error : new Error(String(error));

        this.logger.error(
          `Listener ${listener.name} failed on ${event.constructor.name}: ${failure.message}`,
        );
        failures.push(failure);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `${failures.length} listener(s) failed on ${event.constructor.name}`,
      );
    }
  }

  /**
   * Worker-side counterpart of listen(): rebuilds the event instance from the
   * job payload so the listener receives the same class it subscribed to,
   * `instanceof` included, rather than a bare object that happens to have the
   * right keys.
   */
  resolveQueued(
    data: EventDispatchJobData,
  ): { listener: EventListener<object>; event: object } | null {
    const constructor = this.constructorsByName.get(data.eventName);

    if (!constructor) {
      return null;
    }

    const listener = (this.listeners.get(constructor) ?? []).find(
      (candidate) => candidate.name === data.listenerName,
    );

    if (!listener) {
      return null;
    }

    const event = Object.assign(
      Object.create(constructor.prototype as object) as object,
      data.payload,
    );

    return { listener, event };
  }

  private async enqueue<TEvent extends object>(
    event: TEvent,
    listener: EventListener<object>,
  ): Promise<void> {
    const data: EventDispatchJobData = {
      eventName: event.constructor.name,
      listenerName: listener.name,
      payload: { ...event } as Record<string, unknown>,
      // Captured here, inside the request, because the worker has no request
      // to read it from: a queued listener that ran with no tenant would read
      // and write whatever the unscoped client returns, across every tenant.
      tenantId: currentTenantId(),
    };

    await this.jobs.dispatchTo(EVENTS_QUEUE, EVENT_DISPATCH_JOB, data);
  }
}

function currentTenantId(): string | null {
  try {
    return TenantContextStorage.getTenantId();
  } catch {
    // Dispatching outside a request is legitimate (CLI backfills, seeders).
    // The job records the absence rather than guessing a tenant.
    return null;
  }
}
