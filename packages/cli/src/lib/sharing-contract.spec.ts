import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBlueprint } from './blueprint';
import { historyColumnEntries } from './history-templates';
import { openApiClientFile } from './openapi-client';
import { describeSchema, historySchemas } from './openapi-schemas';
import { buildResourceContext } from './resource-context';
import { controllerFile, policyFile, serviceFile } from './templates';

function contextOf(yaml: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hery-sharing-'));
  const file = path.join(dir, 'doc.yaml');
  writeFileSync(file, yaml);

  return buildResourceContext(loadBlueprint(file));
}

const DOC = `
name: Doc
history: true
sharing: true
fields:
  - name: title
    type: string
workflow:
  initial: draft
  transitions:
    - name: publish
      from: [draft]
      to: published
    - name: archive
      from: [draft, published]
      to: archived
      shareable: false
permissions:
  view: own
  create: own
  update: own
  delete: own
sorts: []
`;

describe('per-record sharing across the contract', () => {
  const ctx = contextOf(DOC);
  const plain = contextOf(DOC.replace('sharing: true\n', ''));

  it('lets a reader by share read the history and a writer by share revert it', () => {
    const policy = policyFile(ctx);

    expect(policy).toMatch(
      /canViewHistoryDoc[^;]*DOC_PRESETS\.view, subject, record, 'read'\)/,
    );
    expect(policy).toMatch(
      /canRevertDoc[^;]*DOC_PRESETS\.update, subject, record, 'write'\)/,
    );
    expect(policyFile(plain)).not.toContain("record, 'read'");
  });

  it('lets a writer by share fire a transition unless the blueprint keeps it out', () => {
    const policy = policyFile(ctx);

    expect(policy).toMatch(
      /canPublishDoc[^;]*TRANSITION_PRESETS\.publish, subject, record, 'write'\)/,
    );
    expect(policy).toMatch(
      /canArchiveDoc[^;]*TRANSITION_PRESETS\.archive, subject, record\)/,
    );
  });

  it('snapshots the workflow state without making it revertible', () => {
    expect(historyColumnEntries(ctx)).toEqual([
      'Doc.title',
      'Doc.status',
      'Doc.deletedAt',
    ]);
    expect(serviceFile(ctx)).toContain("HISTORY_REVERTIBLE_FIELDS = ['title']");
    expect(historySchemas(ctx).DocSnapshot).toMatchObject({
      properties: {
        status: { type: 'string', enum: ['draft', 'published', 'archived'] },
      },
    });
  });

  it('publishes sharing in the OpenAPI describe schema exactly when describe does', () => {
    const properties = (
      describeSchema(ctx) as { properties: Record<string, unknown> }
    ).properties;
    const plainProperties = (
      describeSchema(plain) as { properties: Record<string, unknown> }
    ).properties;

    expect(controllerFile(ctx)).toContain('sharing: true,');
    expect(properties.sharing).toEqual({ const: true });
    expect(controllerFile(plain)).not.toContain('sharing: true,');
    expect(plainProperties.sharing).toBeUndefined();
  });

  it('gives the typed client the share routes the controller serves', () => {
    const client = openApiClientFile([ctx]);

    expect(client).toContain('shares: (id: string) =>');
    expect(client).toContain(
      "'POST', `/docs/${encodeURIComponent(id)}/shares/search`",
    );
    expect(client).toContain(
      "'POST', `/docs/${encodeURIComponent(id)}/shares`, share",
    );
    expect(client).toContain(
      "'DELETE', `/docs/${encodeURIComponent(id)}/shares/${encodeURIComponent(shareId)}`",
    );
    expect(client).toContain('  sharing: true;');
    expect(openApiClientFile([plain])).not.toContain('grantShare');
  });
});
