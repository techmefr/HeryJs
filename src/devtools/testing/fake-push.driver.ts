import type {
  PushDriver,
  PushMessage,
  PushOutcome,
  PushPlatform,
} from '#technical/push/push-driver';
import { RecordingFake } from './recording-fake';
import type { RecordPredicate } from './recording-fake';

export interface RecordedPush {
  token: string;
  platform: PushPlatform;
  message: PushMessage;
}

export class FakePushDriver
  extends RecordingFake<RecordedPush>
  implements PushDriver
{
  protected readonly label = 'a push notification to be sent';

  outcome: PushOutcome = 'sent';

  get sent(): readonly RecordedPush[] {
    return this.all;
  }

  send(
    token: string,
    platform: PushPlatform,
    message: PushMessage,
  ): Promise<PushOutcome> {
    this.record({ token, platform, message });

    return Promise.resolve(this.outcome);
  }

  assertSent(predicate?: RecordPredicate<RecordedPush>, times?: number): void {
    this.assertRecorded(predicate, times);
  }

  assertNotSent(predicate?: RecordPredicate<RecordedPush>): void {
    this.assertNotRecorded(predicate);
  }

  assertNothingSent(): void {
    this.assertNotRecorded();
  }

  waitForSent(
    predicate?: RecordPredicate<RecordedPush>,
    timeoutMs?: number,
  ): Promise<RecordedPush> {
    return this.waitForRecorded(predicate, timeoutMs);
  }
}
