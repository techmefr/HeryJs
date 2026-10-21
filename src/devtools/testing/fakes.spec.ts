import { DEFAULT_QUEUE, EVENTS_QUEUE } from '#technical/jobs/jobs.constants';
import { FakeAssertionError } from './fake-assertion.error';
import { FakeClock } from './fake-clock';
import { FakeEvents } from './fake-events';
import { FakeJobs } from './fake-jobs';
import { FakeLocks } from './fake-lock';
import { FakeMailDriver } from './fake-mail.driver';
import { FakeNotifier } from './fake-notifier';
import { FakePushDriver } from './fake-push.driver';
import { FakeSmsDriver } from './fake-sms.driver';
import { FakeStorageDriver } from './fake-storage.driver';
import { FakeStorageObjectNotFoundException } from './fake-storage-object-not-found.exception';
import { createTestFakes, resetTestFakes } from './test-fakes';

class OrderPaid {
  constructor(public readonly orderId: string) {}
}

class OrderRefunded {}

describe('FakeMailDriver', () => {
  it('records what was sent and asserts on it', async () => {
    const mail = new FakeMailDriver();

    await mail.send({ to: 'a@example.test', subject: 'Hi', html: '<p>Hi</p>' });

    mail.assertSent();
    mail.assertSent((message) => message.to === 'a@example.test', 1);
    mail.assertNotSent((message) => message.to === 'b@example.test');
    expect(mail.sent).toHaveLength(1);
  });

  it('fails assertSent with what it did record', () => {
    const mail = new FakeMailDriver();

    expect(() => mail.assertSent()).toThrow(FakeAssertionError);
    expect(() => mail.assertSent()).toThrow('nothing was recorded');
  });

  it('fails assertNotSent and assertNothingSent once something went out', async () => {
    const mail = new FakeMailDriver();
    await mail.send({ to: 'a@example.test', subject: 'Hi', html: '' });

    expect(() => mail.assertNothingSent()).toThrow(FakeAssertionError);
    expect(() => mail.assertSent(undefined, 2)).toThrow('2 time(s)');
  });

  it('resolves waitForSent as soon as a matching message arrives', async () => {
    const mail = new FakeMailDriver();
    const waiting = mail.waitForSent((message) => message.subject === 'Later');

    await mail.send({ to: 'a@example.test', subject: 'Later', html: '' });

    await expect(waiting).resolves.toMatchObject({ subject: 'Later' });
  });

  it('times out waitForSent when nothing matches', async () => {
    const mail = new FakeMailDriver();

    await expect(mail.waitForSent(undefined, 60)).rejects.toThrow('Timed out');
  });

  it('forgets everything on reset', async () => {
    const mail = new FakeMailDriver();
    await mail.send({ to: 'a@example.test', subject: 'Hi', html: '' });

    mail.reset();

    mail.assertNothingSent();
  });
});

describe('FakeSmsDriver and FakePushDriver', () => {
  it('records sms messages', async () => {
    const sms = new FakeSmsDriver();

    await sms.send({ to: '+33600000000', body: 'Code 1234' });

    sms.assertSent((message) => message.body.includes('1234'));
    sms.assertNotSent((message) => message.to === '+33611111111');
  });

  it('records push messages and reports the configured outcome', async () => {
    const push = new FakePushDriver();

    await expect(
      push.send('tok', 'ios', { title: 'T', body: 'B' }),
    ).resolves.toBe('sent');

    push.outcome = 'expired';

    await expect(
      push.send('tok2', 'web', { title: 'T', body: 'B' }),
    ).resolves.toBe('expired');
    push.assertSent((record) => record.token === 'tok2', 1);
    push.assertSent(undefined, 2);
  });
});

describe('FakeStorageDriver', () => {
  it('holds objects in memory and serves them back', async () => {
    const storage = new FakeStorageDriver();

    await storage.put('t/a.png', Buffer.from('abc'), 'image/png');

    storage.assertStored('t/a.png');
    storage.assertNotStored('t/b.png');
    await expect(storage.get('t/a.png')).resolves.toEqual(Buffer.from('abc'));
    await expect(storage.stat('t/a.png')).resolves.toEqual({
      size: 3,
      contentType: 'image/png',
    });
    await expect(storage.stat('t/b.png')).resolves.toBeNull();
    await expect(storage.signedUrl('t/a.png')).resolves.toContain('t/a.png');
    await expect(storage.presignPut('t/c.png')).resolves.toHaveProperty('url');
  });

  it('records removals and refuses reads of a missing object', async () => {
    const storage = new FakeStorageDriver();
    await storage.put('t/a.png', Buffer.from('abc'), 'image/png');

    await storage.remove('t/a.png');

    storage.assertRemoved('t/a.png');
    storage.assertNotStored('t/a.png');
    storage.assertNotStored();
    await expect(storage.get('t/a.png')).rejects.toBeInstanceOf(
      FakeStorageObjectNotFoundException,
    );
    expect(() => storage.assertStored()).toThrow(FakeAssertionError);
  });

  it('clears held objects on reset', async () => {
    const storage = new FakeStorageDriver();
    await storage.put('t/a.png', Buffer.from('abc'), 'image/png');

    storage.reset();

    expect(storage.keys).toEqual([]);
    storage.assertOperation(undefined, 0);
  });
});

describe('FakeJobs', () => {
  it('records the queue, name, data and policy of a dispatch', async () => {
    const jobs = new FakeJobs();

    await jobs.dispatch('mail.send', { to: 'a' });
    await jobs.dispatchTo(EVENTS_QUEUE, 'event.dispatch', { eventName: 'X' });

    jobs.assertDispatched(
      'mail.send',
      (job) => job.queueName === DEFAULT_QUEUE,
      1,
    );
    jobs.assertDispatched(
      'event.dispatch',
      (job) => job.queueName === EVENTS_QUEUE,
    );
    jobs.assertNotDispatched('mail.send', (job) => job.data.to === 'b');
    jobs.assertNotDispatched('export.run');
  });

  it('hands each recorded job to a processor once', async () => {
    const jobs = new FakeJobs();
    const process = jest.fn().mockResolvedValue(undefined);
    await jobs.dispatch('mail.send', { to: 'a' });
    await jobs.dispatch('export.run');

    const first = await jobs.drain(
      { process },
      (job) => job.name === 'mail.send',
    );
    const again = await jobs.drain({ process });

    expect(first).toBe(1);
    expect(again).toBe(1);
    expect(process).toHaveBeenCalledTimes(2);
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'mail.send', data: { to: 'a' } }),
    );

    jobs.reset();
    await jobs.dispatch('mail.send', { to: 'b' });

    await expect(jobs.drain({ process })).resolves.toBe(1);
  });

  it('fails assertNothingDispatched after a dispatch', async () => {
    const jobs = new FakeJobs();

    jobs.assertNothingDispatched();
    await jobs.dispatch('x');

    expect(() => jobs.assertNothingDispatched()).toThrow(FakeAssertionError);
  });
});

describe('FakeEvents', () => {
  it('records events by class and payload without running listeners', async () => {
    const events = new FakeEvents();
    const handle = jest.fn();
    events.listen(OrderPaid, { name: 'Notify', handle });

    await events.dispatch(new OrderPaid('o-1'));

    events.assertDispatched(OrderPaid, (event) => event.orderId === 'o-1', 1);
    events.assertNotDispatched(OrderPaid, (event) => event.orderId === 'o-2');
    events.assertNotDispatched(OrderRefunded);
    expect(handle).not.toHaveBeenCalled();
  });

  it('runs synchronous listeners when asked to call through, never queued ones', async () => {
    const events = new FakeEvents();
    const handle = jest.fn();
    const queued = jest.fn();
    events.listen(OrderPaid, { name: 'Sync', handle });
    events.listen(OrderPaid, {
      name: 'Queued',
      isQueued: true,
      handle: queued,
    });
    events.callThrough();

    await events.dispatch(new OrderPaid('o-1'));

    expect(handle).toHaveBeenCalledTimes(1);
    expect(queued).not.toHaveBeenCalled();
  });

  it('resolves no queued listener and stops calling through on reset', () => {
    const events = new FakeEvents();
    events.callThrough();

    events.reset();

    expect(events.isCallingThrough).toBe(false);
    expect(events.resolveQueued()).toBeNull();
    events.assertNothingDispatched();
  });
});

describe('FakeLocks', () => {
  it('grants a lock once and reports contention on the second try', async () => {
    const locks = new FakeLocks();

    const first = await locks.acquire('nightly');
    const second = await locks.acquire('nightly');

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    locks.assertAcquired('nightly', 1);
    locks.assertContended('nightly', 1);

    await first?.release();
    locks.assertReleased('nightly');
    expect(locks.heldNames).toEqual([]);
  });

  it('skips runExclusively while someone else holds the lock', async () => {
    const locks = new FakeLocks();
    const work = jest.fn();
    locks.hold('nightly');

    await expect(locks.runExclusively('nightly', work)).resolves.toBe(
      'skipped',
    );

    expect(work).not.toHaveBeenCalled();
    locks.assertNotAcquired('nightly');

    locks.free('nightly');

    await expect(locks.runExclusively('nightly', work)).resolves.toBe('ran');
    expect(work).toHaveBeenCalledTimes(1);
    locks.assertReleased('nightly');
  });

  it('releases a lock even when the work throws, and ignores a second release', async () => {
    const locks = new FakeLocks();

    await expect(
      locks.runExclusively('nightly', () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const handle = await locks.acquire('other');
    await handle?.release();
    await handle?.release();
    handle?.stopRenewing();

    locks.assertReleased('nightly');
    locks.assertReleased('other');
    locks.assertAcquired('other', 1);
  });
});

describe('FakeClock', () => {
  const clock = new FakeClock();

  afterEach(() => {
    clock.restore();
  });

  it('freezes time at an instant and moves it on demand', async () => {
    clock.freeze('2026-01-01T00:00:00.000Z');
    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');

    clock.travel(60_000);

    expect(Date.now()).toBe(new Date('2026-01-01T00:01:00.000Z').getTime());

    clock.set('2027-06-01T12:00:00.000Z');

    expect(new Date().getFullYear()).toBe(2027);
  });

  it('freezes implicitly on travel and returns to real time on restore', () => {
    const before = Date.now();

    clock.travel(86_400_000);

    expect(clock.isFrozen).toBe(true);
    expect(Date.now() - before).toBeGreaterThanOrEqual(86_400_000);

    clock.restore();

    expect(clock.isFrozen).toBe(false);
    expect(Date.now() - before).toBeLessThan(86_400_000);
  });

  it('starts frozen when set is the first call', () => {
    clock.set('2030-01-01T00:00:00.000Z');

    expect(clock.isFrozen).toBe(true);
    expect(new Date().getFullYear()).toBe(2030);
  });
});

describe('FakeNotifier', () => {
  it('records deliveries on each channel', async () => {
    const notifier = new FakeNotifier();

    await notifier.mailChannel.send({
      to: 'a@example.test',
      build: () => ({ to: 'a@example.test', subject: 'S', html: '<p>B</p>' }),
    });
    await notifier.smsChannel.send({ to: '+33600000000', body: 'Code' });
    await notifier.pushChannel.sendToUser('u-1', { title: 'T', body: 'B' });

    notifier.assertSent(
      (record) => record.channel === 'mail' && record.to === 'a@example.test',
      1,
    );
    notifier.assertSent((record) => record.channel === 'sms');
    notifier.assertSent(
      (record) => record.channel === 'push' && record.to === 'u-1',
    );
    notifier.assertNotSent((record) => record.to === 'nobody');
    expect(notifier.delivered).toHaveLength(3);
  });

  it('plugs into the notifier channel hooks and unplugs again', async () => {
    const hooks = await import('#technical/notifier/notifier-mail-channel');
    const notifier = new FakeNotifier();

    notifier.install();

    expect(hooks.notifierMailChannel()).toBe(notifier.mailChannel);

    notifier.uninstall();

    expect(hooks.notifierMailChannel()).toBeNull();
    notifier.assertNothingSent();
  });
});

describe('createTestFakes', () => {
  it('builds every fake and resets them together', async () => {
    const fakes = createTestFakes();
    await fakes.mail.send({ to: 'a@example.test', subject: 'S', html: '' });
    await fakes.jobs.dispatch('x');
    fakes.push.outcome = 'failed';
    fakes.clock.freeze();

    resetTestFakes(fakes);

    fakes.mail.assertNothingSent();
    fakes.jobs.assertNothingDispatched();
    expect(fakes.push.outcome).toBe('sent');
    expect(fakes.clock.isFrozen).toBe(false);
  });
});
