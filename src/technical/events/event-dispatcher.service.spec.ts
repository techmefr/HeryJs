import { EVENTS_QUEUE } from '#technical/jobs/jobs.constants';
import type { JobsService } from '#technical/jobs/jobs.service';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { EventDispatcher } from './event-dispatcher.service';
import { EVENT_DISPATCH_JOB } from './event.types';
import type { EventDispatchJobData, EventListener } from './event.types';

class UserRegistered {
  constructor(public readonly userId: string) {}
}

class OrderPaid {
  constructor(public readonly orderId: string) {}
}

interface DispatchedJob {
  queueName: string;
  name: string;
  data: EventDispatchJobData;
}

interface FakeJobs {
  service: JobsService;
  dispatched: DispatchedJob[];
  only(): DispatchedJob;
}

function fakeJobs(): FakeJobs {
  const dispatched: DispatchedJob[] = [];
  const service = {
    // Only dispatchTo: a queued listener must never land on the default queue.
    // Three processor families share BullMQ, and a worker handed a job whose
    // name it does not recognise returns immediately -- marking it completed
    // without ever running the listener. Recording the queue here is what
    // makes that regression visible.
    dispatchTo(
      queueName: string,
      name: string,
      data: Record<string, unknown> = {},
    ) {
      dispatched.push({
        queueName,
        name,
        data: data as unknown as EventDispatchJobData,
      });
      return Promise.resolve();
    },
  } as unknown as JobsService;

  return {
    service,
    dispatched,
    only(): DispatchedJob {
      const [job] = dispatched;

      if (!job) {
        throw new Error('No job was dispatched');
      }

      return job;
    },
  };
}

describe('EventDispatcher', () => {
  it('runs the listener registered for the dispatched event', async () => {
    const dispatcher = new EventDispatcher(fakeJobs().service);
    const seen: string[] = [];

    dispatcher.listen(UserRegistered, {
      name: 'welcome-mail',
      handle: (event) => {
        seen.push(event.userId);
      },
    });

    await dispatcher.dispatch(new UserRegistered('user-1'));

    expect(seen).toEqual(['user-1']);
  });

  it('leaves a listener of another event untouched', async () => {
    const dispatcher = new EventDispatcher(fakeJobs().service);
    const unrelated = jest.fn();

    dispatcher.listen(OrderPaid, { name: 'invoice', handle: unrelated });

    await dispatcher.dispatch(new UserRegistered('user-1'));

    expect(unrelated).not.toHaveBeenCalled();
  });

  it('sends a queued listener to the queue instead of running it inline', async () => {
    const jobs = fakeJobs();
    const dispatcher = new EventDispatcher(jobs.service);
    const handle = jest.fn();

    dispatcher.listen(UserRegistered, {
      name: 'reindex',
      isQueued: true,
      handle,
    });

    await dispatcher.dispatch(new UserRegistered('user-1'));

    expect(handle).not.toHaveBeenCalled();
    expect(jobs.dispatched).toHaveLength(1);
    expect(jobs.only().name).toBe(EVENT_DISPATCH_JOB);
    expect(jobs.only().queueName).toBe(EVENTS_QUEUE);
    expect(jobs.only().data).toMatchObject({
      eventName: 'UserRegistered',
      listenerName: 'reindex',
      payload: { userId: 'user-1' },
    });
  });

  it('carries the dispatching tenant into the queued job', async () => {
    const jobs = fakeJobs();
    const dispatcher = new EventDispatcher(jobs.service);

    dispatcher.listen(UserRegistered, {
      name: 'reindex',
      isQueued: true,
      handle: jest.fn(),
    });

    await TenantContextStorage.run({ tenantId: 'tenant-a' }, () =>
      dispatcher.dispatch(new UserRegistered('user-1')),
    );

    expect(jobs.only().data.tenantId).toBe('tenant-a');
  });

  it('records no tenant when dispatched outside a request', async () => {
    const jobs = fakeJobs();
    const dispatcher = new EventDispatcher(jobs.service);

    dispatcher.listen(UserRegistered, {
      name: 'reindex',
      isQueued: true,
      handle: jest.fn(),
    });

    await dispatcher.dispatch(new UserRegistered('user-1'));

    expect(jobs.only().data.tenantId).toBeNull();
  });

  it('runs every listener even when one throws, then reports the failure', async () => {
    const dispatcher = new EventDispatcher(fakeJobs().service);
    const after = jest.fn();

    dispatcher.listen(UserRegistered, {
      name: 'broken',
      handle: () => {
        throw new Error('listener exploded');
      },
    });
    dispatcher.listen(UserRegistered, { name: 'healthy', handle: after });

    await expect(
      dispatcher.dispatch(new UserRegistered('user-1')),
    ).rejects.toThrow(AggregateError);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the event instance for a queued listener', async () => {
    const jobs = fakeJobs();
    const dispatcher = new EventDispatcher(jobs.service);
    const handle = jest.fn();
    const listener: EventListener<UserRegistered> = {
      name: 'reindex',
      isQueued: true,
      handle,
    };

    dispatcher.listen(UserRegistered, listener);
    await dispatcher.dispatch(new UserRegistered('user-1'));

    const resolved = dispatcher.resolveQueued(jobs.only().data);

    if (!resolved) {
      throw new Error('The queued listener was not resolved');
    }

    expect(resolved.event).toBeInstanceOf(UserRegistered);
    expect((resolved.event as UserRegistered).userId).toBe('user-1');
  });

  it('resolves nothing for a listener that no longer exists', () => {
    const dispatcher = new EventDispatcher(fakeJobs().service);

    dispatcher.listen(UserRegistered, { name: 'reindex', handle: jest.fn() });

    expect(
      dispatcher.resolveQueued({
        eventName: 'UserRegistered',
        listenerName: 'gone',
        payload: {},
        tenantId: null,
      }),
    ).toBeNull();
  });
});
