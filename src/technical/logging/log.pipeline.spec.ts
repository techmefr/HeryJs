import { LogPipeline } from './log.pipeline';
import type { LogDriver, LogEntry } from './log-driver';

const LINE = '{"level":30,"msg":"hello"}';

function recording(): LogDriver & { seen: LogEntry[] } {
  const seen: LogEntry[] = [];

  return { seen, write: (entry) => void seen.push(entry) };
}

describe('LogPipeline', () => {
  it('writes to the fallback until drivers are attached', () => {
    const fallback = recording();

    new LogPipeline(fallback).write(LINE);

    expect(fallback.seen.map((entry) => entry.message)).toEqual(['hello']);
  });

  it('sends every line to every attached driver, not the fallback', () => {
    const fallback = recording();
    const first = recording();
    const second = recording();
    const pipeline = new LogPipeline(fallback);

    pipeline.attach([first, second]);
    pipeline.write(LINE);

    expect(first.seen).toHaveLength(1);
    expect(second.seen).toHaveLength(1);
    expect(fallback.seen).toHaveLength(0);
  });

  it('lets one throwing driver leave the others unharmed', () => {
    const healthy = recording();
    const pipeline = new LogPipeline(recording());
    const stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);

    pipeline.attach([
      {
        write: () => {
          throw new Error('disk full');
        },
      },
      healthy,
    ]);

    expect(() => pipeline.write(LINE)).not.toThrow();
    expect(healthy.seen).toHaveLength(1);

    stderr.mockRestore();
  });

  it('falls back when attached an empty set', () => {
    const fallback = recording();
    const pipeline = new LogPipeline(fallback);

    pipeline.attach([]);
    pipeline.write(LINE);

    expect(fallback.seen).toHaveLength(1);
  });

  it('closes what was attached and returns to the fallback', async () => {
    const fallback = recording();
    const close = jest.fn(() => Promise.resolve());
    const pipeline = new LogPipeline(fallback);

    pipeline.attach([{ write: () => undefined, close }]);
    await pipeline.detach();
    pipeline.write(LINE);

    expect(close).toHaveBeenCalledTimes(1);
    expect(fallback.seen).toHaveLength(1);
  });

  it('survives a driver that fails to close', async () => {
    const pipeline = new LogPipeline(recording());
    const stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);

    pipeline.attach([
      { write: () => undefined, close: () => Promise.reject(new Error('x')) },
    ]);

    await expect(pipeline.detach()).resolves.toBeUndefined();

    stderr.mockRestore();
  });
});
