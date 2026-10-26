import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { load } from 'js-yaml';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function readJson<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(ROOT, ...segments), 'utf8')) as T;
}

interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, { steps: { run?: string }[] }>;
}

describe('release setup', () => {
  const workflow = load(
    readFileSync(
      path.join(ROOT, '.github', 'workflows', 'release.yml'),
      'utf8',
    ),
  ) as Workflow;

  it('runs on a manual dispatch only', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
  });

  it('only dry-runs semantic-release and never publishes', () => {
    const commands = Object.values(workflow.jobs)
      .flatMap((job) => job.steps)
      .map((step) => step.run ?? '')
      .filter((run) => run.length > 0);

    expect(commands.some((run) => run.includes('semantic-release'))).toBe(true);
    commands
      .filter((run) => run.includes('semantic-release'))
      .forEach((run) => expect(run).toContain('--dry-run'));
    commands.forEach((run) => expect(run).not.toMatch(/\bpublish\b/));
  });

  it('keeps @heryjs/core private', () => {
    expect(
      readJson<{ private?: boolean }>('packages', 'core', 'package.json')
        .private,
    ).toBe(true);
  });

  it('releases from main with v-prefixed tags and no publishing plugin', () => {
    const config = readJson<{
      branches: string[];
      tagFormat: string;
      plugins: string[];
    }>('.releaserc.json');

    expect(config.branches).toEqual(['main']);
    expect(config.tagFormat).toBe('v${version}');
    expect(config.plugins).not.toContain('@semantic-release/npm');
  });
});

describe('Renovate preset for generated projects', () => {
  const preset = readJson<{
    packageRules: {
      matchPackageNames: string[];
      matchUpdateTypes?: string[];
      groupName?: string;
      automerge?: boolean;
    }[];
    postUpgradeTasks: { commands: string[] };
  }>('renovate', 'heryjs.json');

  it('groups every @heryjs package', () => {
    expect(preset.packageRules).toContainEqual(
      expect.objectContaining({
        matchPackageNames: ['@heryjs/**'],
        groupName: 'heryjs',
      }),
    );
  });

  it('automerges minors and patches, never majors', () => {
    const rule = (type: string) =>
      preset.packageRules.find((r) => r.matchUpdateTypes?.includes(type));

    expect(rule('minor')?.automerge).toBe(true);
    expect(rule('patch')?.automerge).toBe(true);
    expect(rule('major')?.automerge).toBe(false);
  });

  it('never automerges a bump of @heryjs/core, which may need a migration', () => {
    const automerging = preset.packageRules.findIndex(
      (r) => r.automerge === true,
    );
    const core = preset.packageRules.findIndex(
      (r) =>
        r.matchPackageNames.includes('@heryjs/core') &&
        r.matchUpdateTypes === undefined,
    );

    expect(core).toBeGreaterThan(automerging);
    expect(preset.packageRules[core]?.automerge).toBe(false);
  });

  it('runs hery upgrade after the bump', () => {
    expect(preset.postUpgradeTasks.commands).toContain('pnpm hery upgrade');
  });
});
