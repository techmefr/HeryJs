import {
  compatibilityProblem,
  installableModules,
} from './module-compatibility';
import type { LoadedModule } from './module-definition';
import { KERNEL_VERSION } from './kernel-version';

describe('whether a module may be installed here', () => {
  it('accepts a range this kernel satisfies', () => {
    expect(compatibilityProblem('>=1.0.0', '1.4.2')).toBeUndefined();
    expect(compatibilityProblem('^1.2.0', '1.4.2')).toBeUndefined();
    expect(compatibilityProblem('1.4.2', '1.4.2')).toBeUndefined();
  });

  it('defaults to the version this kernel declares', () => {
    expect(compatibilityProblem(`>=${KERNEL_VERSION}`)).toBeUndefined();
  });

  // The message names both sides, because neither one alone tells the
  // developer what to do: the range is the module author's decision and the
  // version is theirs.
  it('reports the range and the version when the kernel is too old', () => {
    expect(compatibilityProblem('>=2.0.0', '1.4.2')).toBe(
      'was written for HeryJs >=2.0.0, and this project is on 1.4.2',
    );
  });

  it('reports a kernel that has moved past the range', () => {
    expect(compatibilityProblem('^1.0.0', '2.0.0')).toBe(
      'was written for HeryJs ^1.0.0, and this project is on 2.0.0',
    );
  });

  // A range nobody can parse is the worse failure of the two: semver treats
  // an unparsable range as matching nothing, so left unreported it would look
  // exactly like a module written for another version.
  it('separates an unparsable range from an unsatisfied one', () => {
    expect(compatibilityProblem('latest', '1.4.2')).toBe(
      'declares meta.compatibility "latest", which is not a semver range',
    );
    expect(compatibilityProblem('1.x.y.z', '1.4.2')).toBe(
      'declares meta.compatibility "1.x.y.z", which is not a semver range',
    );
  });

  // Not this function's job to reject: semver reads the empty range as "any
  // version", and a definition whose compatibility is empty is already
  // refused as a missing field before an install can reach here.
  it('leaves an empty range to the definition check', () => {
    expect(compatibilityProblem('', '1.4.2')).toBeUndefined();
  });

  // A kernel released as a prerelease still has to be able to install its own
  // modules, which the default semver behaviour refuses.
  it('lets a prerelease kernel satisfy a plain range', () => {
    expect(compatibilityProblem('>=1.0.0', '1.1.0-rc.1')).toBeUndefined();
  });
});

describe('what install is allowed to run', () => {
  let logged: string[];

  function moduleFor(name: string, compatibility: string): LoadedModule {
    return {
      name,
      description: `${name}, for this test`,
      meta: { compatibility },
      dest: `src/modules/${name}`,
      channel: 'community',
      packageDir: `/nowhere/${name}`,
      install: () => undefined,
    };
  }

  beforeEach(() => {
    logged = [];
    jest.spyOn(console, 'log').mockImplementation((message: unknown) => {
      logged.push(String(message));
    });
    process.exitCode = undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('keeps a module written for this kernel', () => {
    const modules = [moduleFor('here', `>=${KERNEL_VERSION}`)];

    expect(installableModules(modules, false)).toEqual(modules);
    expect(process.exitCode).toBeUndefined();
  });

  // Refused rather than reported and installed: past this point the module has
  // already added dependencies and written files the project owns.
  it('drops an incompatible module and fails the command', () => {
    const kept = moduleFor('here', `>=${KERNEL_VERSION}`);

    const installable = installableModules(
      [moduleFor('ahead', '>=99.0.0'), kept],
      false,
    );

    expect(installable).toEqual([kept]);
    expect(process.exitCode).toBe(1);
    expect(logged.join('\n')).toContain('install it with --force');
  });

  it('installs an incompatible module when forced, and says so', () => {
    const modules = [moduleFor('ahead', '>=99.0.0')];

    expect(installableModules(modules, true)).toEqual(modules);
    expect(process.exitCode).toBeUndefined();
    expect(logged.join('\n')).toContain('installing anyway');
  });

  it('refuses a module whose range cannot be parsed', () => {
    expect(installableModules([moduleFor('vague', 'latest')], false)).toEqual(
      [],
    );
    expect(process.exitCode).toBe(1);
  });
});
