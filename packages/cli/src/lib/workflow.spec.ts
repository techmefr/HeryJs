import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBlueprint } from './blueprint';
import { buildResourceContext } from './resource-context';
import {
  controllerFile,
  dtoFile,
  policyFile,
  presetsFile,
  prismaModelBlock,
  serviceFile,
  specFile,
  viewFile,
} from './templates';
import { buildOpenApiDocument } from './openapi';
import { openApiClientFile } from './openapi-client';

const MACHINE = `
workflow:
  initial: draft
  transitions:
    - name: publish
      from: [draft]
      to: published
      requires: [summary]
    - name: archive
      from: [draft, published]
      to: archived
      permission: all
    - name: reopen
      from: [archived]
      to: draft
`;

const BASE = `name: Note
fields:
  - name: title
    type: string
  - name: summary
    type: string
    optional: true
sorts:
  - createdAt
`;

function load(extra: string, base = BASE) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hery-workflow-'));
  const file = path.join(dir, 'note.yaml');
  writeFileSync(file, `${base}${extra}`);

  return loadBlueprint(file);
}

const ctx = buildResourceContext(load(MACHINE));
const plain = buildResourceContext(load(''));

describe('a workflow in a blueprint', () => {
  it('lists every state once, the initial one first', () => {
    expect(ctx.workflow?.states).toEqual(['draft', 'published', 'archived']);
  });

  it('defaults the column to status and a transition to the own preset', () => {
    expect(ctx.workflow?.field).toBe('status');
    expect(ctx.workflow?.transitions.map((item) => item.permission)).toEqual([
      'own',
      'all',
      'own',
    ]);
  });

  it('is absent from a blueprint that does not declare one', () => {
    expect(plain.workflow).toBeNull();
    expect(controllerFile(plain)).not.toContain('transition');
    expect(prismaModelBlock(plain)).not.toContain('status');
  });

  it.each([
    [
      'an unrouted resource',
      'routed: false\n' + MACHINE,
      /workflow only applies to a routed resource/,
    ],
    [
      'a duplicated transition',
      MACHINE +
        '    - name: publish\n      from: [archived]\n      to: draft\n',
      /transition "publish" is declared twice/,
    ],
    [
      'a transition named after an existing route',
      'workflow:\n  initial: a\n  transitions:\n    - name: update\n      from: [a]\n      to: b\n',
      /name of a route or capability/,
    ],
    [
      'a guard on a field nobody declared',
      'workflow:\n  initial: a\n  transitions:\n    - name: go\n      from: [a]\n      to: b\n      requires: [ghost]\n',
      /requires "ghost", which is not a declared field/,
    ],
    [
      'a state column declared as a field',
      'workflow:\n  field: title\n  initial: a\n  transitions:\n    - name: go\n      from: [a]\n      to: b\n',
      /is the column the workflow adds/,
    ],
  ])('refuses %s', (_label, extra, message) => {
    expect(() => load(extra)).toThrow(message);
  });
});

describe('the files generated for a workflow', () => {
  it('adds the state column with the initial state as its default', () => {
    expect(prismaModelBlock(ctx)).toContain('status');
    expect(prismaModelBlock(ctx)).toContain('@default("draft")');
  });

  it('shows the state in the view but never accepts it on write', () => {
    expect(viewFile(ctx)).toContain('status: z.string()');
    expect(dtoFile(ctx)).not.toMatch(/Fields = z\.object\(\{[^}]*status/);
  });

  it('accepts only declared transition names on the transition route', () => {
    expect(dtoFile(ctx)).toContain(
      "NOTE_TRANSITIONS = ['publish', 'archive', 'reopen'] as const",
    );
  });

  it('resolves one preset per transition, from the blueprint', () => {
    const presets = presetsFile(ctx);

    expect(presets).toContain("publish: 'own'");
    expect(presets).toContain("archive: 'all'");
  });

  it('gives each transition its own capability, not the update one', () => {
    const policy = policyFile(ctx);

    expect(policy).toContain('export const canPublishNote');
    expect(policy).toContain('export const canArchiveNote');
    expect(policy).toContain('NOTE_TRANSITION_PRESETS.archive');
    expect(policy).toContain('publish: canPublishNote(subject, record)');
  });

  it('writes the move, the audit entry and the event in one transaction', () => {
    const service = serviceFile(ctx);

    expect(service).toContain('async transition(');
    expect(service).toContain('assertTransitionAllowed');
    expect(service).toContain('where: { id: record.id, status: current }');
    expect(service).toContain('await recordTransition(ambient.tx');
  });

  it('exposes POST transition behind its own capability and publishes the machine', () => {
    const controller = controllerFile(ctx);

    expect(controller).toContain("@Post('transition')");
    expect(controller).toContain('@Capability(canTransitionAnyNote)');
    expect(controller).toContain('workflow: {');
    expect(controller).toContain("field: 'status'");
    expect(controller).toContain("'status'");
  });

  it('generates a suite that proves transitions, refusals and permissions', () => {
    const spec = specFile(ctx);

    expect(spec).toContain("describe('workflow'");
    expect(spec).toContain('moves along a declared edge');
    expect(spec).toContain('refuses an illegal transition with a typed error');
    expect(spec).toContain("key: 'note.illegalTransition'");
    expect(spec).toContain('refuses a transition whose guard is not met');
    expect(spec).toContain("key: 'note.transitionGuard'");
    expect(spec).toContain('refuses the transition to someone');
  });
});

describe('the contract published for a workflow', () => {
  it('documents the transition route and its request body', () => {
    const document = buildOpenApiDocument([ctx]) as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, { properties?: unknown }> };
    };

    expect(Object.keys(document.paths)).toContain('/notes/transition');
    expect(document.components.schemas.NoteTransitionRequest).toBeDefined();
  });

  it('types the typed client with the transition names', () => {
    const source = openApiClientFile([ctx]);

    expect(source).toContain(
      "export type NoteTransition = 'publish' | 'archive' | 'reopen'",
    );
    expect(source).toContain("'POST', '/notes/transition'");
  });
});
