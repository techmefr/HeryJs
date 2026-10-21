import { parseLogLine } from './log-line';

describe('parseLogLine', () => {
  it('reads a pino line into a structured entry', () => {
    const entry = parseLogLine(
      `${JSON.stringify({
        level: 50,
        time: 1_700_000_000_000,
        pid: 1,
        hostname: 'h',
        tenantId: 'acme',
        msg: 'boom',
        req: { url: '/x' },
      })}\n`,
    );

    expect(entry).toMatchObject({
      level: 'error',
      message: 'boom',
      tenantId: 'acme',
      fields: { req: { url: '/x' } },
    });
    expect(entry.time.getTime()).toBe(1_700_000_000_000);
  });

  it('keeps the line exactly as written, minus its newline', () => {
    const line = '{"level":30,"msg":"hi"}';

    expect(parseLogLine(`${line}\n`).raw).toBe(line);
  });

  it('leaves structural fields out of the free-form ones', () => {
    const entry = parseLogLine(
      '{"level":30,"time":1,"pid":1,"hostname":"h","msg":"m","tenantId":"t","a":1}',
    );

    expect(entry.fields).toEqual({ a: 1 });
  });

  it.each([
    [10, 'trace'],
    [20, 'debug'],
    [30, 'info'],
    [40, 'warn'],
    [50, 'error'],
    [60, 'fatal'],
  ])('maps pino level %i to %s', (level, name) => {
    expect(parseLogLine(JSON.stringify({ level, msg: 'm' })).level).toBe(name);
  });

  it('accepts a level already named', () => {
    expect(parseLogLine('{"level":"warn","msg":"m"}').level).toBe('warn');
  });

  it('has no tenant when the line carries none', () => {
    expect(parseLogLine('{"level":30,"msg":"m"}').tenantId).toBeNull();
  });

  it('keeps a line that is not JSON as an info message', () => {
    expect(parseLogLine('plain text from a dependency\n')).toMatchObject({
      level: 'info',
      message: 'plain text from a dependency',
      raw: 'plain text from a dependency',
    });
  });

  it('keeps JSON that is not an object as a message too', () => {
    expect(parseLogLine('42')).toMatchObject({ message: '42' });
  });
});
