import { DEFAULT_JOB_POLICY, jobOptions, RUN_ONCE_POLICY } from './job-policy';

describe('jobOptions', () => {
  /**
   * The regression this exists for: every job used to reach BullMQ with no
   * options at all, which means one attempt and no backoff. A mail send that
   * hit a momentary DNS failure was lost, and the only trace was a dashboard
   * row nobody was watching.
   */
  it('asks for more than one attempt by default', () => {
    expect(jobOptions().attempts).toBeGreaterThan(1);
  });

  it('backs off exponentially rather than hammering a service that is down', () => {
    expect(jobOptions().backoff).toEqual({
      type: 'exponential',
      delay: DEFAULT_JOB_POLICY.backoffMs,
    });
  });

  // A completed job is evidence of nothing; a failed one is the only record of
  // what went wrong, so it is kept far longer.
  it('keeps failed jobs longer than completed ones', () => {
    const options = jobOptions();

    expect(options.removeOnFail).toBeGreaterThan(
      options.removeOnComplete as number,
    );
  });

  it('honours a policy that refuses to retry', () => {
    expect(jobOptions(RUN_ONCE_POLICY).attempts).toBe(1);
  });

  it('applies the caller policy rather than the default', () => {
    const options = jobOptions({
      attempts: 7,
      backoffMs: 250,
      keepCompleted: 1,
      keepFailed: 2,
    });

    expect(options).toEqual({
      attempts: 7,
      backoff: { type: 'exponential', delay: 250 },
      removeOnComplete: 1,
      removeOnFail: 2,
    });
  });
});
