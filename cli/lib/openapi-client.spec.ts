import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as ts from 'typescript';
import { loadBlueprint } from './blueprint';
import { buildResourceContext } from './resource-context';
import { OPENAPI_ABSENCES } from './openapi-contract';
import { discoverResourceContexts } from './openapi';
import { openApiClientFile } from './openapi-client';

const EXAMPLES = path.join(__dirname, '..', '..', 'examples');
const blogPost = buildResourceContext(
  loadBlueprint(path.join(EXAMPLES, 'blog-post.yaml')),
);
const fixtureContexts = discoverResourceContexts(
  path.join(__dirname, 'fixtures', 'openapi', 'blueprints'),
);
const generated = openApiClientFile([blogPost, ...fixtureContexts]);

const VALID_USAGE = `
import { createHeryClient, type HeryRequest } from './client';

declare const request: HeryRequest;
const api = createHeryClient(request);

export async function run(): Promise<void> {
  const found = await api.blogPosts.search({
    filters: [
      { field: 'title', operator: 'like', value: 'x' },
      { type: 'or', nested: [{ field: 'id', value: ['a', 'b'], operator: 'in' }] },
    ],
    sorts: [{ field: 'createdAt', direction: 'desc' }],
    page: 2,
    limit: 20,
    withTrashed: true,
    includes: [{ relation: 'notes', limit: 3, filters: [{ field: 'body', value: 'x' }] }],
    aggregates: [
      { relation: 'notes', type: 'avg', field: 'rating', alias: 'averageRating' },
      { relation: 'comments', type: 'count' },
    ],
    capabilities: ['update'],
  });
  const total: number = found.meta.total;
  const lastPage: number = found.meta.last_page;
  const channels: string[] = found.meta.channels;
  const first = found.data[0];
  if (first) {
    const title: string = first.title;
    const deletedAt: string | null = first.deletedAt;
    const average: unknown = first.averageRating;
    void [title, deletedAt, average, total, lastPage, channels];
  }

  const projected = await api.blogPosts.search({ selects: [{ field: 'title' }, { field: 'id' }] });
  const title: string | undefined = projected.data[0]?.title;
  void title;

  const created = await api.blogPosts.create([{ title: 'hello' }]);
  for (const outcome of created.data) {
    if (outcome.status === 'ok') {
      const id: string = outcome.data.id;
      void id;
    } else {
      const message: string = outcome.error.message;
      void message;
    }
  }

  await api.blogPosts.update([{ id: 'a', title: 'b', relations: { tags: { attach: ['t'] } } }]);
  await api.blogPosts.update([{ id: 'a', relations: { tags: { sync: ['t'] } } }]);
  await api.blogPosts.remove(['a'], { mode: 'hard' });
  await api.blogPosts.restore(['a'], { title: 'back' });
  const batch = await api.blogPosts.create([{ title: 'a' }], { atomic: true });
  const succeeded: number = batch.meta.succeeded;
  void succeeded;
  await api.blogPosts.remove(['a'], { mode: 'soft', atomic: true });
  await api.blogPosts.restore(['a'], undefined, { atomic: true });
  const rows = await api.blogPosts.searchNotes('a', { limit: 5, sorts: [{ field: 'createdAt' }] });
  const rowTotal: number = rows.meta.total;
  const described = await api.blogPosts.describe();
  const version: 1 = described.data.version;
  void [rowTotal, version];

  const widgets = await api.widgets.search({ filters: [{ field: 'quantity', operator: '>=', value: 2 }] });
  const unpaged: false = widgets.meta.paginated;
  const widget = widgets.data[0];
  const quantity: number | null | undefined = widget?.quantity;
  const teamId: string | undefined = widget?.teamId;
  void [unpaged, quantity, teamId];

  await api.widgets.create([{ label: 'l', isActive: true, secret: 's', shippedAt: '2026-01-01T00:00:00Z' }]);
  await api.widgets.remove(['w']);
  await api.widgets.searchParts('w', { filters: [{ field: 'name', value: 'bolt' }], limit: 10 });
  await api.widgetsV2.search({});
}
`;

const INVALID_LINES = [
  "api.blogPosts.search({ filters: [{ field: 'nope', value: 1 }] });",
  "api.blogPosts.search({ sorts: [{ field: 'title' }] });",
  "api.blogPosts.search({ selects: [{ field: 'secret' }] });",
  "api.blogPosts.search({ includes: [{ relation: 'tags' }] });",
  'api.blogPosts.search({ limit: 7 });',
  "api.blogPosts.search({ aggregates: [{ relation: 'comments', type: 'avg', field: 'body' }] });",
  'api.blogPosts.create([{}]);',
  'api.blogPosts.create([{ title: 1 }]);',
  "api.blogPosts.update([{ title: 'no id' }]);",
  "api.blogPosts.update([{ id: 'a', relations: { tags: { sync: ['t'], attach: ['u'] } } }]);",
  'api.widgets.search({ page: 1 });',
  'api.widgets.search({ withTrashed: true });',
  "api.widgets.restore(['w']);",
  "api.widgets.remove(['w'], { mode: 'hard' });",
  "api.widgets.create([{ label: 'l', isActive: true, quantity: null }]);",
  "api.widgets.search({ selects: [{ field: 'secret' }] });",
  "api.widgets.searchParts('w', { limit: 7 });",
  'api.blogPosts.search().then(found => found.data[0]!.nope.length);',
  "api.blogPosts.search({ selects: [{ field: 'id' }] }).then(found => found.data[0]!.title.length);",
  'api.blogPosts.describe().then(found => { const version: 2 = found.data.version; return version; });',
];

function diagnosticsFor(files: Record<string, string>): ts.Diagnostic[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'hery-openapi-client-'));

  try {
    const paths = Object.entries(files).map(([name, content]) => {
      const file = path.join(dir, name);
      writeFileSync(file, content);
      return file;
    });
    const program = ts.createProgram(paths, {
      strict: true,
      noEmit: true,
      lib: ['lib.es2022.d.ts'],
      types: [],
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
    });
    return [...ts.getPreEmitDiagnostics(program)];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('openApiClientFile', () => {
  it('lists what it does not claim at the top of the file', () => {
    for (const absence of OPENAPI_ABSENCES) {
      expect(generated).toContain(`// - ${absence}`);
    }
  });

  it('keeps the two versions of a resource under distinct client keys', () => {
    expect(generated).toContain('widgets: widgetClient(request)');
    expect(generated).toContain('widgetsV2: widgetV2Client(request)');
  });

  it('offers restore only where the blueprint keeps a bin, and a delete mode with it', () => {
    expect(generated).toContain("'/blog-posts/restore'");
    expect(generated).not.toContain("'/widgets/restore'");
  });

  it('typechecks a consumer written against the real contract', () => {
    const messages = diagnosticsFor({
      'client.ts': generated,
      'usage.ts': VALID_USAGE,
    }).map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    );

    expect(messages).toEqual([]);
  });

  it('refuses every line that steps outside the contract', () => {
    const source = `import { createHeryClient, type HeryRequest } from './client';
declare const request: HeryRequest;
const api = createHeryClient(request);
${INVALID_LINES.join('\n')}
`;
    const firstInvalidLine = 4;
    const failing = new Set(
      diagnosticsFor({ 'client.ts': generated, 'usage.ts': source })
        .filter((diagnostic) => diagnostic.file?.fileName.endsWith('usage.ts'))
        .map(
          (diagnostic) =>
            diagnostic.file!.getLineAndCharacterOfPosition(
              diagnostic.start ?? 0,
            ).line + 1,
        ),
    );
    const accepted = INVALID_LINES.filter(
      (_line, index) => !failing.has(firstInvalidLine + index),
    );

    expect(accepted).toEqual([]);
  });
});
