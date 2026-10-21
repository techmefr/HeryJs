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

export class FakeJobs extends RecordingFake<RecordedJob> {
  protected readonly label = 'a job to be dispatched';

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
