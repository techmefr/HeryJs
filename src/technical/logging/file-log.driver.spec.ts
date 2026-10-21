import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { FileLogDriver } from './file-log.driver';
import { parseLogLine } from './log-line';

function entry(message: string) {
  return parseLogLine(JSON.stringify({ level: 30, msg: message }));
}

describe('FileLogDriver', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'file-log-'));
    file = path.join(dir, 'nested', 'app.log');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates the directory and appends one line per entry, in order', async () => {
    const driver = new FileLogDriver({
      path: file,
      maxBytes: 10_000,
      maxFiles: 3,
    });

    driver.write(entry('one'));
    driver.write(entry('two'));
    await driver.flush();

    const lines = (await readFile(file, 'utf8')).trim().split('\n');

    expect(
      lines.map((line) => (JSON.parse(line) as { msg: string }).msg),
    ).toEqual(['one', 'two']);
  });

  it('rotates once the live file would pass the size cap', async () => {
    const line = `${entry('aaaa').raw}\n`;
    const driver = new FileLogDriver({
      path: file,
      maxBytes: Buffer.byteLength(line) * 2,
      maxFiles: 3,
    });

    for (const message of ['aaaa', 'bbbb', 'cccc']) {
      driver.write(entry(message));
    }

    await driver.flush();

    expect(await readFile(file, 'utf8')).toContain('cccc');
    expect(await readFile(`${file}.1`, 'utf8')).toContain('aaaa');
    expect(await readFile(`${file}.1`, 'utf8')).toContain('bbbb');
  });

  it('keeps no more generations than asked for', async () => {
    const line = `${entry('xxxx').raw}\n`;
    const driver = new FileLogDriver({
      path: file,
      maxBytes: Buffer.byteLength(line),
      maxFiles: 2,
    });

    for (const message of ['1111', '2222', '3333', '4444', '5555']) {
      driver.write(entry(message));
    }

    await driver.flush();

    const names = (await readdir(path.dirname(file))).sort();

    expect(names).toEqual(['app.log', 'app.log.1', 'app.log.2']);
    expect(await readFile(file, 'utf8')).toContain('5555');
    expect(await readFile(`${file}.2`, 'utf8')).toContain('3333');
  });

  it('keeps only the live file when told to keep one', async () => {
    const line = `${entry('xxxx').raw}\n`;
    const driver = new FileLogDriver({
      path: file,
      maxBytes: Buffer.byteLength(line),
      maxFiles: 1,
    });

    driver.write(entry('1111'));
    driver.write(entry('2222'));
    await driver.flush();

    expect(await readdir(path.dirname(file))).toEqual(['app.log']);
    expect(await readFile(file, 'utf8')).toContain('2222');
  });

  it('carries on from the size of a file that already exists', async () => {
    const line = `${entry('xxxx').raw}\n`;
    const driver = new FileLogDriver({
      path: file,
      maxBytes: Buffer.byteLength(line) + 1,
      maxFiles: 2,
    });

    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, line);

    driver.write(entry('2222'));
    await driver.flush();

    expect(await readFile(`${file}.1`, 'utf8')).toContain('xxxx');
    expect(await readFile(file, 'utf8')).toContain('2222');
  });

  it('reports a write it cannot make instead of throwing', async () => {
    const stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    const blocker = path.join(dir, 'blocker');
    await writeFile(blocker, 'a file where a directory is needed');
    const driver = new FileLogDriver({
      path: path.join(blocker, 'app.log'),
      maxBytes: 100,
      maxFiles: 2,
    });

    driver.write(entry('lost'));

    await expect(driver.flush()).resolves.toBeUndefined();
    expect(stderr).toHaveBeenCalled();

    stderr.mockRestore();
  });
});
