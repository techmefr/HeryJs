import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as ts from 'typescript';
import { loadBlueprint } from './blueprint';
import { buildResourceContext } from './resource-context';
import type { ResourceContext } from './resource-context';
import {
  controllerFile,
  dtoFile,
  moduleFile,
  prismaModelBlock,
  serviceFile,
  specFile,
} from './templates';

function contextFor(yaml: string): ResourceContext {
  const dir = mkdtempSync(path.join(tmpdir(), 'hery-vector-templates-'));
  const file = path.join(dir, 'note.yaml');
  writeFileSync(file, yaml);

  return buildResourceContext(loadBlueprint(file));
}

const VECTOR_BLUEPRINT = `
name: Note
fields:
  - name: title
    type: string
  - name: body
    type: string
    optional: true
  - name: embedding
    type: vector
    dimensions: 8
    source: body
pagination:
  limits: [10, 15]
  default: 15
`;

const PLAIN_BLUEPRINT = `
name: Note
fields:
  - name: title
    type: string
`;

function syntaxErrors(source: string): string[] {
  const result = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2023 },
  });

  return (result.diagnostics ?? []).map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  );
}

describe('a resource with a vector field', () => {
  const ctx = contextFor(VECTOR_BLUEPRINT);

  it('keeps the vector out of the scalar fields every other template reads', () => {
    expect(ctx.fields.map((field) => field.name)).toEqual(['title', 'body']);
    expect(ctx.vector).toMatchObject({
      name: 'embedding',
      dimensions: 8,
      source: 'body',
    });
  });

  it('never lets a client write the vector', () => {
    expect(dtoFile(ctx)).not.toContain('embedding');
  });

  it('declares the column as an unsupported pgvector type, nullable', () => {
    expect(prismaModelBlock(ctx)).toContain(
      'embedding Unsupported("vector(8)")?',
    );
  });

  it.each([
    ['service', serviceFile],
    ['controller', controllerFile],
    ['module', moduleFile],
    ['spec', specFile],
  ])('generates a %s that parses', (_name, render) => {
    expect(syntaxErrors(render(ctx))).toEqual([]);
  });

  it('registers its target so the outbox handler knows which column to embed', () => {
    const service = serviceFile(ctx);

    expect(service).toContain('this.vectors.track(VECTOR_TARGET);');
    expect(service).toContain("sourceColumn: 'body'");
    expect(service).not.toContain('queueEmbedding');
  });

  it('ranks inside the database with the view scope and the trash state', () => {
    const service = serviceFile(ctx);

    expect(service).toContain('private async searchSimilar(');
    expect(service).toContain(
      'const scope = scopeWhereFor(NOTE_PRESETS.view, subject);',
    );
    expect(service).toContain(
      "trash: options.onlyTrashed ? 'only' : options.withTrashed ? 'include' : 'exclude'",
    );
    expect(service).toContain('{ id: { in: matches.ids } }');
  });

  it('publishes similar in the contract and tells the caller which mode answered', () => {
    const controller = controllerFile(ctx);

    expect(controller).toContain('similar: true,');
    expect(controller).toContain("mode: 'similar', metric: similar.metric");
    expect(controller).toContain('nearest matches are ranked and returned');
    expect(controller).toContain(
      'next_cursor: similar ? null : nextCursorFor(',
    );
  });

  it('wires the vector module into the resource module', () => {
    expect(moduleFile(ctx)).toContain('VectorModule');
  });

  it('proves ranking and scope against a stubbed embedder in its own spec', () => {
    const spec = specFile(ctx);

    expect(spec).toContain('.overrideProvider(EMBEDDER)');
    expect(spec).toContain("mode: 'similar'");
    expect(spec).toContain('expect(ids).not.toContain(strangerId);');
  });
});

describe('a resource without a vector field', () => {
  const ctx = contextFor(PLAIN_BLUEPRINT);

  it.each([
    ['service', serviceFile],
    ['controller', controllerFile],
    ['module', moduleFile],
    ['spec', specFile],
    ['model', prismaModelBlock],
  ])('generates a %s that never mentions vectors', (_name, render) => {
    expect(render(ctx)).not.toMatch(/vector|Vector|similar|embed/);
  });
});
