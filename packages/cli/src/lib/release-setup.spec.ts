import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { load } from 'js-yaml';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function readJson<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(ROOT, ...segments), 'utf8')) as T;
}

interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  jobs: Record<string, { if?: string; steps: { run?: string }[] }>;
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

  const commands = Object.values(workflow.jobs)
    .flatMap((job) => job.steps)
    .map((step) => step.run ?? '')
    .filter((run) => run.length > 0);

  it('publishes every package for real, without a dry run', () => {
    const publishing = commands.filter((run) => /\bpublish\b/.test(run));

    expect(publishing).toEqual([
      'pnpm -r publish --access public --no-git-checks',
    ]);
  });

  it('authenticates to npm through OIDC trusted publishing', () => {
    expect(workflow.permissions['id-token']).toBe('write');
  });

  it('reads no npm token from the secrets', () => {
    const text = readFileSync(
      path.join(ROOT, '.github', 'workflows', 'release.yml'),
      'utf8',
    );

    expect(text).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./);
  });

  it('releases from main only', () => {
    expect(
      Object.values(workflow.jobs).every(
        (job) => job.if === "github.ref == 'refs/heads/main'",
      ),
    ).toBe(true);
  });

  it('publishes @heryjs/core and @heryjs/cli publicly with provenance', () => {
    ['core', 'cli'].forEach((dir) => {
      const manifest = readJson<{
        private?: boolean;
        publishConfig?: { access?: string; provenance?: boolean };
      }>('packages', dir, 'package.json');

      expect(manifest.private).toBeUndefined();
      expect(manifest.publishConfig).toEqual({
        access: 'public',
        provenance: true,
      });
    });
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
