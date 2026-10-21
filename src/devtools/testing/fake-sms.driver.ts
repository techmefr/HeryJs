import type { SmsDriver, SmsMessage } from '#technical/sms/sms-driver';
import { RecordingFake } from './recording-fake';
import type { RecordPredicate } from './recording-fake';

export class FakeSmsDriver
  extends RecordingFake<SmsMessage>
  implements SmsDriver
{
  protected readonly label = 'an sms to be sent';

  get sent(): readonly SmsMessage[] {
    return this.all;
  }

  send(message: SmsMessage): Promise<void> {
    this.record(message);

    return Promise.resolve();
  }

  assertSent(predicate?: RecordPredicate<SmsMessage>, times?: number): void {
    this.assertRecorded(predicate, times);
  }

  assertNotSent(predicate?: RecordPredicate<SmsMessage>): void {
    this.assertNotRecorded(predicate);
  }

  assertNothingSent(): void {
    this.assertNotRecorded();
  }

  waitForSent(
    predicate?: RecordPredicate<SmsMessage>,
    timeoutMs?: number,
  ): Promise<SmsMessage> {
    return this.waitForRecorded(predicate, timeoutMs);
  }
}
