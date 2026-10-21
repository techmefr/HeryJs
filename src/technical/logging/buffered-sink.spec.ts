import { BufferedSink } from './buffered-sink';
import { parseLogLine } from './log-line';
import type { LogEntry } from './log-driver';

function entry(message: string): LogEntry {
  return parseLogLine(JSON.stringify({ level: 30, msg: message }));
}

function build(send: (batch: LogEntry[]) => Promise<void>, batchSize = 3) {
  return new BufferedSink({
    driver: 'test',
    batchSize,
    flushIntervalMs: 1000,
    maxBuffered: 5,
    send,
  });
}

describe('BufferedSink', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends a batch when it fills', async () => {
    const send = jest.fn<Promise<void>, [LogEntry[]]>(() => Promise.resolve());
    const sink = build(send);

    ['a', 'b', 'c'].forEach((message) => sink.push(entry(message)));
    await sink.flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it('sends a partial batch when the interval elapses', async () => {
    const send = jest.fn<Promise<void>, [LogEntry[]]>(() => Promise.resolve());
    const sink = build(send);

    sink.push(entry('a'));
    expect(send).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1000);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('holds no more than its bound, dropping the oldest', async () => {
    const send = jest.fn<Promise<void>, [LogEntry[]]>(() => Promise.resolve());
    const sink = build(send, 100);

    for (let index = 0; index < 8; index += 1) {
      sink.push(entry(`m${index}`));
    }

    await sink.flush();

    const sent = send.mock.calls[0]?.[0] ?? [];

    expect(sent.map((item) => item.message)).toEqual([
      'm3',
      'm4',
      'm5',
      'm6',
      'm7',
    ]);
  });

  it('reports a failed batch, drops it and keeps going', async () => {
    const stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    const send = jest
      .fn<Promise<void>, [LogEntry[]]>()
      .mockRejectedValueOnce(new Error('collector down'))
      .mockResolvedValue(undefined);
    const sink = build(send, 1);

    sink.push(entry('lost'));
    await sink.flush();
    sink.push(entry('kept'));
    await sink.flush();

    expect(send).toHaveBeenCalledTimes(2);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('collector down'),
    );

    stderr.mockRestore();
  });

  it('has nothing to send when nothing was written', async () => {
    const send = jest.fn<Promise<void>, [LogEntry[]]>(() => Promise.resolve());

    await build(send).flush();

    expect(send).not.toHaveBeenCalled();
  });
});
