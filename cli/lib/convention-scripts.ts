import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import { COPIED_CONVENTION_SCRIPTS } from './copied-conventions';

const REGISTRY = path.join('scripts', 'check-conventions.ts');
const WORKFLOW = path.join('.github', 'workflows', 'ci.yml');

export const FRAMEWORK_CONVENTIONS_STEP = '- run: pnpm run lint:conventions\n';
export const PROJECT_CONVENTIONS_STEP = '- run: pnpm hery check\n';

/**
 * A package script that runs this repository's convention checks. A project
 * runs `hery check` instead: the checks that apply to its code ship in
 * @heryjs/core, and the rest -- the demo against its generator, the module
 * packages against their installed copies, the kernel against its manifest --
 * ask questions only this repository can answer.
 */
export function isFrameworkConventionScript(command: string): boolean {
  return (
    command.includes('scripts/check-conventions.ts') ||
    /^pnpm run lint:conventions\b/.test(command)
  );
}

export function withProjectConventionScripts(
  scripts: Record<string, string>,
): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(scripts).filter(
        ([, command]) => !isFrameworkConventionScript(command),
      ),
    ),
    check: 'pnpm hery check',
  };
}

export function withProjectConventionStep(workflow: string): string {
  return workflow.replace(FRAMEWORK_CONVENTIONS_STEP, PROJECT_CONVENTIONS_STEP);
}

export interface CopiedConventionScripts {
  identical: string[];
  modified: string[];
}

/**
 * The convention scripts an older `hery new` copied into the project, split
 * by whether each is still byte for byte a file this repository shipped.
 * A modified registry keeps every script: it is the project's own setup now,
 * and the scripts it imports go with it.
 */
export function copiedConventionScripts(root: string): CopiedConventionScripts {
  const dir = path.join(root, 'scripts');

  if (!existsSync(dir)) {
    return { identical: [], modified: [] };
  }

  const copied = readdirSync(dir)
    .map((entry) => path.join('scripts', entry))
    .filter(
      (file) =>
        COPIED_CONVENTION_SCRIPTS[file.split(path.sep).join('/')] !== undefined,
    )
    .sort();
  const isShipped = (file: string): boolean =>
    COPIED_CONVENTION_SCRIPTS[file.split(path.sep).join('/')]!.includes(
      createHash('sha256')
        .update(readFileSync(path.join(root, file)))
        .digest('hex'),
    );

  if (copied.includes(REGISTRY) && !isShipped(REGISTRY)) {
    return { identical: [], modified: copied };
  }

  return {
    identical: copied.filter(isShipped),
    modified: copied.filter((file) => !isShipped(file)),
  };
}

/**
 * Removes the copied scripts that are still the framework's, and with the
 * registry the package scripts and the CI step that ran it. Returns the files
 * that changed, or would change when `write` is off.
 */
export function removeCopiedConventionScripts(
  root: string,
  { identical }: CopiedConventionScripts,
  { write }: { write: boolean },
): string[] {
  const changed = [...identical];

  if (write) {
    identical.forEach((file) => rmSync(path.join(root, file)));
  }

  if (!identical.includes(REGISTRY)) {
    return changed;
  }

  const manifestFile = path.join(root, 'package.json');

  if (existsSync(manifestFile)) {
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = withProjectConventionScripts(manifest.scripts ?? {});

    if (JSON.stringify(scripts) !== JSON.stringify(manifest.scripts)) {
      changed.push('package.json');

      if (write) {
        writeFileSync(
          manifestFile,
          `${JSON.stringify({ ...manifest, scripts }, null, 2)}\n`,
        );
      }
    }
  }

  const workflowFile = path.join(root, WORKFLOW);

  if (existsSync(workflowFile)) {
    const source = readFileSync(workflowFile, 'utf8');
    const next = withProjectConventionStep(source);

    if (next !== source) {
      changed.push(WORKFLOW);

      if (write) {
        writeFileSync(workflowFile, next);
      }
    }
  }

  return changed;
}
