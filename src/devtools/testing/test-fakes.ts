import { FakeClock } from './fake-clock';
import { FakeEvents } from './fake-events';
import { FakeJobs } from './fake-jobs';
import { FakeLocks } from './fake-lock';
import { FakeMailDriver } from './fake-mail.driver';
import { FakeNotifier } from './fake-notifier';
import { FakePushDriver } from './fake-push.driver';
import { FakeSmsDriver } from './fake-sms.driver';
import { FakeStorageDriver } from './fake-storage.driver';

export interface TestFakes {
  mail: FakeMailDriver;
  sms: FakeSmsDriver;
  push: FakePushDriver;
  storage: FakeStorageDriver;
  notifier: FakeNotifier;
  jobs: FakeJobs;
  events: FakeEvents;
  locks: FakeLocks;
  clock: FakeClock;
}

export type TestFakeName = keyof TestFakes;

export const ALL_FAKE_NAMES: TestFakeName[] = [
  'mail',
  'sms',
  'push',
  'storage',
  'notifier',
  'jobs',
  'events',
  'locks',
  'clock',
];

export const DEFAULT_FAKE_NAMES: TestFakeName[] = [
  'mail',
  'sms',
  'push',
  'storage',
];

export function createTestFakes(): TestFakes {
  return {
    mail: new FakeMailDriver(),
    sms: new FakeSmsDriver(),
    push: new FakePushDriver(),
    storage: new FakeStorageDriver(),
    notifier: new FakeNotifier(),
    jobs: new FakeJobs(),
    events: new FakeEvents(),
    locks: new FakeLocks(),
    clock: new FakeClock(),
  };
}

export function resetTestFakes(fakes: TestFakes): void {
  fakes.mail.reset();
  fakes.sms.reset();
  fakes.push.reset();
  fakes.push.outcome = 'sent';
  fakes.storage.reset();
  fakes.notifier.reset();
  fakes.jobs.reset();
  fakes.events.reset();
  fakes.locks.reset();
  fakes.clock.restore();
}
