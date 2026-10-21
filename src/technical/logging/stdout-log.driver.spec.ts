import { shouldPrettyPrint, StdoutLogDriver } from './stdout-log.driver';
import { parseLogLine } from './log-line';

const RAW = '{"level":30,"time":1700000000000,"msg":"hello"}';

describe('StdoutLogDriver', () => {
  it('writes the line as logged, one per entry, when not pretty', () => {
    const written: string[] = [];

    new StdoutLogDriver({
      isPretty: false,
      write: (text) => written.push(text),
    }).write(parseLogLine(RAW));

    expect(written).toEqual([`${RAW}\n`]);
  });

  it('formats a human-readable line when pretty', () => {
    const written: string[] = [];

    new StdoutLogDriver({
      isPretty: true,
      write: (text) => written.push(text),
    }).write(parseLogLine(RAW));

    expect(written).toHaveLength(1);
    expect(written[0]).toContain('hello');
    expect(written[0]).not.toContain('"msg"');
  });
});

describe('shouldPrettyPrint', () => {
  it.each([
    ['development', true],
    [undefined, true],
    ['production', false],
    ['test', false],
  ])('for NODE_ENV %s is %s', (env, expected) => {
    expect(shouldPrettyPrint(env)).toBe(expected);
  });
});
