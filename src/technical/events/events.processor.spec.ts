import type { Job } from 'bullmq';
import type { JobsService } from '#technical/jobs/jobs.service';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { EventDispatcher } from './event-dispatcher.service';
import { EventsProcessor } from './events.processor';
import { EVENT_DISPATCH_JOB } from './event.types';
import type { EventDispatchJobData } from './event.types';

class UserRegistered {
  constructor(public readonly userId: string) {}
}

function job(name: string, data: EventDispatchJobData): Job {
  return { name, data } as unknown as Job;
}

describe('EventsProcessor', () => {
  const jobs = { dispatch: () => Promise.resolve() } as unknown as JobsService;

  it('reopens the tenant context the event was dispatched under', async () => {
    const dispatcher = new EventDispatcher(jobs);
    const tenants: string[] = [];

    dispatcher.listen(UserRegistered, {
      name: 'reindex',
      isQueued: true,
      handle: () => {
        tenants.push(TenantContextStorage.getTenantId());
      },
    });

    const processor = new EventsProcessor(dispatcher);

    await processor.process(
      job(EVENT_DISPATCH_JOB, {
        eventName: 'UserRegistered',
        listenerName: 'reindex',
        payload: { userId: 'user-1' },
        tenantId: 'tenant-a',
      }),
    );

    expect(tenants).toEqual(['tenant-a']);
  });

  it('ignores a job belonging to another producer on the shared queue', async () => {
    const dispatcher = new EventDispatcher(jobs);
    const handle = jest.fn();

    dispatcher.listen(UserRegistered, {
      name: 'reindex',
      isQueued: true,
      handle,
    });

    const processor = new EventsProcessor(dispatcher);

    await processor.process(
      job('mail.send', {
        eventName: 'UserRegistered',
        listenerName: 'reindex',
        payload: {},
        tenantId: 'tenant-a',
      }),
    );

    expect(handle).not.toHaveBeenCalled();
  });

  it('drops a job whose listener is gone rather than retrying forever', async () => {
    const processor = new EventsProcessor(new EventDispatcher(jobs));

    await expect(
      processor.process(
        job(EVENT_DISPATCH_JOB, {
          eventName: 'UserRegistered',
          listenerName: 'reindex',
          payload: {},
          tenantId: 'tenant-a',
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
