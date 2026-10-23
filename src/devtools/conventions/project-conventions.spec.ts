import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  checkNoFixedSleeps,
  checkSubjectConstruction,
  checkTenantIsolation,
  projectConventionChecks,
  runConventionChecks,
} from './index';

// Spelled in two parts so this spec is not itself a spec that sleeps.
const FIXED_WAIT = ['set', 'Timeout'].join('');

describe('the conventions a project runs with hery check', () => {
  let root: string;

  const write = (file: string, source: string): void => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), source);
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'hery-conventions-'));
    mkdirSync(path.join(root, 'src'));
    mkdirSync(path.join(root, 'cli'));
    mkdirSync(path.join(root, 'test'));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('reads no file of src/technical: a project has none, the kernel is a dependency', () => {
    expect(checkSubjectConstruction(root)).toBe(true);
  });

  it('refuses a subject a project writes by hand, since no project file is allowed to', () => {
    write(
      'src/functional/note/note.service.ts',
      'const subject = { id, teamIds: [] };\n',
    );

    expect(checkSubjectConstruction(root)).toBe(false);
  });

  it('still requires every allowed builder to exist where one is named', () => {
    expect(() =>
      checkSubjectConstruction(
        root,
        new Map([['src/technical/capabilities/subject.ts', 'the builder']]),
      ),
    ).toThrow('no longer exists');
  });

  it('holds each module installed under src/modules to its tenant isolation proof', () => {
    write(
      'src/modules/push/push.service.spec.ts',
      "describe('push', () => {});\n",
    );

    expect(checkTenantIsolation(root)).toBe(false);

    write(
      'src/modules/push/push.isolation.spec.ts',
      "describe('tenant isolation', () => {});\n",
    );

    expect(checkTenantIsolation(root)).toBe(true);
  });

  it("refuses a fixed sleep in a project's own spec", () => {
    write('src/functional/note/note.spec.ts', 'await waitFor(check);\n');

    expect(checkNoFixedSleeps(root)).toBe(true);

    write(
      'src/functional/note/note.spec.ts',
      `await new Promise((resolve) => ${FIXED_WAIT}(resolve, 100));\n`,
    );

    expect(checkNoFixedSleeps(root)).toBe(false);
  });

  it('reports an allowance that no longer sleeps as stale', () => {
    write('src/functional/note/note.spec.ts', 'await waitFor(check);\n');

    expect(
      checkNoFixedSleeps(root, {
        roots: ['src'],
        allowed: new Map([['src/functional/note/note.spec.ts', 'polls']]),
      }),
    ).toBe(false);
  });

  it('runs no check that only the framework repository can answer', () => {
    expect(projectConventionChecks(root).map((check) => check.name)).toEqual([
      'capabilities',
      'admin-contract',
      'scope-parity',
      'rls',
      'dev-guard',
      'no-fixed-sleeps',
      'no-raw-pii-log',
      'subject',
      'tenant-isolation',
    ]);
  });

  it('runs every selected check even after one fails, and names the failures', async () => {
    const ran: string[] = [];
    const failed = await runConventionChecks([
      { name: 'a', run: () => (ran.push('a'), false) },
      {
        name: 'b',
        run: () => {
          ran.push('b');
          throw new Error('boom');
        },
      },
      { name: 'c', run: () => (ran.push('c'), true) },
    ]);

    expect(ran).toEqual(['a', 'b', 'c']);
    expect(failed).toEqual(['a', 'b']);
  });

  it('refuses an unknown check name before running anything', async () => {
    const run = jest.fn(() => true);

    await expect(
      runConventionChecks([{ name: 'a', run }], ['nope']),
    ).rejects.toThrow('Unknown check: nope');
    expect(run).not.toHaveBeenCalled();
  });
});
