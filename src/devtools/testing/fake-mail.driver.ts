import type { MailDriver, MailMessage } from '#technical/mail/mail-driver';
import { RecordingFake } from './recording-fake';
import type { RecordPredicate } from './recording-fake';

export class FakeMailDriver
  extends RecordingFake<MailMessage>
  implements MailDriver
{
  protected readonly label = 'a mail to be sent';

  get sent(): readonly MailMessage[] {
    return this.all;
  }

  send(message: MailMessage): Promise<void> {
    this.record(message);

    return Promise.resolve();
  }

  assertSent(predicate?: RecordPredicate<MailMessage>, times?: number): void {
    this.assertRecorded(predicate, times);
  }

  assertNotSent(predicate?: RecordPredicate<MailMessage>): void {
    this.assertNotRecorded(predicate);
  }

  assertNothingSent(): void {
    this.assertNotRecorded();
  }

  waitForSent(
    predicate?: RecordPredicate<MailMessage>,
    timeoutMs?: number,
  ): Promise<MailMessage> {
    return this.waitForRecorded(predicate, timeoutMs);
  }
}
