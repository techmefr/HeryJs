import type { Job } from 'bullmq';
import type { JobPolicy } from '#technical/jobs/job-policy';
import { DEFAULT_QUEUE } from '#technical/jobs/jobs.constants';
import { RecordingFake } from './recording-fake';
import type { RecordPredicate } from './recording-fake';

export interface RecordedJob {
  queueName: string;
  name: string;
  data: Record<string, unknown>;
  policy: JobPolicy | undefined;
}

export interface JobProcessor {
  process(job: Job): Promise<unknown>;
}

export class FakeJobs extends RecordingFake<RecordedJob> {
  protected readonly label = 'a job to be dispatched';

  private readonly drained = new Set<RecordedJob>();

  get dispatched(): readonly RecordedJob[] {
    return this.all;
  }

  dispatch(
    name: string,
    data: Record<string, unknown> = {},
    policy?: JobPolicy,
  ): Promise<undefined> {
    return this.dispatchTo(DEFAULT_QUEUE, name, data, policy);
  }

  dispatchTo(
    queueName: string,
    name: string,
    data: Record<string, unknown> = {},
    policy?: JobPolicy,
  ): Promise<undefined> {
    this.record({ queueName, name, data, policy });

    return Promise.resolve(undefined);
  }

  async drain(
    processor: JobProcessor,
    predicate?: RecordPredicate<RecordedJob>,
  ): Promise<number> {
    const pending = this.matching(predicate).filter(
      (job) => !this.drained.has(job),
    );

    for (const job of pending) {
      this.drained.add(job);
      await processor.process({
        name: job.name,
        data: job.data,
        queueName: job.queueName,
      } as unknown as Job);
    }

    return pending.length;
  }

  override reset(): void {
    super.reset();
    this.drained.clear();
  }

  assertDispatched(
    name: string,
    predicate?: RecordPredicate<RecordedJob>,
    times?: number,
  ): void {
    this.assertRecorded((job) => this.isMatch(job, name, predicate), times);
  }

  assertNotDispatched(
    name: string,
    predicate?: RecordPredicate<RecordedJob>,
  ): void {
    this.assertNotRecorded((job) => this.isMatch(job, name, predicate));
  }

  assertNothingDispatched(): void {
    this.assertNotRecorded();
  }

  private isMatch(
    job: RecordedJob,
    name: string,
    predicate?: RecordPredicate<RecordedJob>,
  ): boolean {
    return job.name === name && (predicate ? predicate(job) : true);
  }
}
