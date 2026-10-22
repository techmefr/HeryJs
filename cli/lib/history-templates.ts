import type { ScalarBlueprintField } from './blueprint';
import { shareAccess } from './resource-context';
import type { ResourceContext } from './resource-context';

/**
 * The fields a snapshot keeps, and a restore may write back: everything the
 * blueprint declares except what it hides or encrypts. This is the one place
 * the rule lives -- the registry the kernel reads, the service's revert list and
 * the generated suite all derive from it.
 */
export function historyFields(ctx: ResourceContext): ScalarBlueprintField[] {
  return ctx.fields.filter(
    (field) => !field.hidden && field.type !== 'encrypted',
  );
}

/**
 * Every column a snapshot keeps. The workflow state is kept so the past shows
 * where the row stood, but it is not revertible: only a transition moves it.
 */
export function historySnapshotColumns(ctx: ResourceContext): string[] {
  return [
    ...historyFields(ctx).map((field) => field.name),
    ...(ctx.workflow ? [ctx.workflow.field] : []),
    ...(ctx.softDeletes ? ['deletedAt'] : []),
    ...(ctx.versioned ? ['version'] : []),
  ];
}

/** What the generator registers in HISTORY_COLUMNS, as `Model.column`. */
export function historyColumnEntries(ctx: ResourceContext): string[] {
  return historySnapshotColumns(ctx).map(
    (column) => `${ctx.modelPascalName}.${column}`,
  );
}

export function historyPolicyBlock(ctx: ResourceContext): string {
  if (!ctx.history) {
    return '';
  }

  return `
// The past of a record is read under the same rule as the record: whoever may
// see it, a reader by share included, may see what it used to be. Its own check
// rather than canView${ctx.pascalName} so a project can tighten history alone
// without touching the read route.
export const canViewHistory${ctx.pascalName}: PolicyCheck<${ctx.pascalName}RecordLike> = (
  subject,
  record,
) => (record ? resolveCapability(${ctx.screamingSnakeName}_PRESETS.view, subject, record${shareAccess(ctx, 'read')}) : { allowed: false });

// Putting a snapshot back is an update, whatever route it travels: it writes
// the record, so the update preset decides, per record, like canUpdate${ctx.pascalName}.
export const canRevert${ctx.pascalName}: PolicyCheck<${ctx.pascalName}RecordLike> = (
  subject,
  record,
) => (record ? resolveCapability(${ctx.screamingSnakeName}_PRESETS.update, subject, record${shareAccess(ctx, 'write')}) : { allowed: false });
`;
}

export function historyCapabilityKeys(ctx: ResourceContext): string[] {
  return ctx.history ? ['history', 'revert'] : [];
}

export function historyCapabilityLines(ctx: ResourceContext): string[] {
  return ctx.history
    ? [
        `      history: canViewHistory${ctx.pascalName}(subject, record),`,
        `      revert: canRevert${ctx.pascalName}(subject, record),`,
      ]
    : [];
}

export function historyPolicyImports(ctx: ResourceContext): string {
  return ctx.history
    ? `\n  canRevert${ctx.pascalName},\n  canViewHistory${ctx.pascalName},`
    : '';
}

export function historyControllerImports(ctx: ResourceContext): string {
  if (!ctx.history) {
    return '';
  }

  return `import {
  historyDiffSchema,
  historyListSchema,
  historyRestoreSchema,
} from '#technical/history/history.schemas';
import type {
  HistoryDiffBody,
  HistoryListBody,
  HistoryRestoreBody,
} from '#technical/history/history.schemas';
`;
}

export function historyRoutes(ctx: ResourceContext): string {
  if (!ctx.history) {
    return '';
  }

  const loader = `${ctx.screamingSnakeName}_RECORD_LOADER`;
  const visibleLoader = ctx.softDeletes
    ? `${ctx.screamingSnakeName}_VISIBLE_RECORD_LOADER`
    : loader;
  const service = `this.${ctx.camelName}s`;

  return `
  // Read with the any-state loader, so the history of a trashed record is
  // still reachable: it is how an operator finds what was there before the
  // delete. Newest first; pass nextBefore back as \`before\` for the next page.
  @Post(':id/history')
  @HttpCode(200)
  @Capability(canViewHistory${ctx.pascalName})
  @LoadRecordWith(${loader}, '${ctx.kebabName}')
  async history(
    @Req() req: RequestWith${ctx.pascalName},
    @Body(new ZodValidationPipe(historyListSchema)) body: HistoryListBody,
  ) {
    const page = await ${service}.historyOf(req.record, body);

    return ok(page.entries, { nextBefore: page.nextBefore });
  }

  // Compares one entry with another, or with the record as it is now when no
  // second one is named. The current side is cut to the same columns as a
  // stored snapshot, so the diff cannot show a field history never kept.
  @Post(':id/history/diff')
  @HttpCode(200)
  @Capability(canViewHistory${ctx.pascalName})
  @LoadRecordWith(${loader}, '${ctx.kebabName}')
  async historyDiff(
    @Req() req: RequestWith${ctx.pascalName},
    @Body(new ZodValidationPipe(historyDiffSchema)) body: HistoryDiffBody,
  ) {
    return ok(await ${service}.historyDiffOf(req.record, body));
  }

  // Not a second write path: the snapshot's fields go through the same update
  // as an edit, so the update policy, ${ctx.versioned ? 'the version check, ' : ''}the audit entry and the change
  // feed all apply, and the revert itself becomes the newest entry of the
  // history. A trashed record is refused here -- bring it back from the bin first.
  @Post(':id/history/restore')
  @Capability(canRevert${ctx.pascalName})
  @LoadRecordWith(${visibleLoader}, '${ctx.kebabName}')
  async restoreHistory(
    @Req() req: RequestWith${ctx.pascalName},
    @Body(new ZodValidationPipe(historyRestoreSchema)) body: HistoryRestoreBody,${ctx.versioned ? `\n    @Headers('if-match') ifMatch?: string,` : ''}
  ) {
    const entry = await ${service}.historyEntryOf(req.record, body.snapshotId);
${
  ctx.versioned
    ? `    const expected = resolveExpectedVersion('${ctx.kebabName}', body.version, ifMatchVersionOf(ifMatch, 1));\n`
    : ''
}    const updated = await ${service}.revert(req.record, entry${ctx.versioned ? ', expected' : ''});

    return ok(to${ctx.pascalName}View(updated));
  }
`;
}

export function historyServiceImports(ctx: ResourceContext): string {
  if (!ctx.history) {
    return '';
  }

  return `import { HistoryService } from '#technical/history/history.service';
import { HistoryOperationStorage } from '#technical/history/history-operation';
import { revertPatchOf } from '#technical/history/snapshot';
import type { HistoryDiffBody, HistoryListBody } from '#technical/history/history.schemas';
import type { HistoryEntry } from '#technical/history/history.types';
`;
}

export function historyServiceConstants(ctx: ResourceContext): string {
  if (!ctx.history) {
    return '';
  }

  return `
const HISTORY_MODEL = '${ctx.modelPascalName}';
// What a restore writes back: the blueprint's fields minus anything hidden or
// encrypted, which history never stored and so can neither show nor restore.
const HISTORY_REVERTIBLE_FIELDS = [${historyFields(ctx)
    .map((field) => `'${field.name}'`)
    .join(', ')}] as const;`;
}

export function historyConstructorParameter(ctx: ResourceContext): string {
  return ctx.history
    ? `\n    private readonly historyLog: HistoryService,`
    : '';
}

export function historyServiceMethods(ctx: ResourceContext): string {
  if (!ctx.history) {
    return '';
  }

  return `
  historyOf(record: ${ctx.modelPascalName}, query: HistoryListBody) {
    return this.historyLog.list(HISTORY_MODEL, record.id, query);
  }

  historyEntryOf(record: ${ctx.modelPascalName}, entryId: string) {
    return this.historyLog.find(HISTORY_MODEL, record.id, entryId);
  }

  historyDiffOf(record: ${ctx.modelPascalName}, body: HistoryDiffBody) {
    return this.historyLog.diff(HISTORY_MODEL, record, body.from, body.to);
  }

  // Declared as a revert so the entry it leaves says so; the write itself is
  // update(), unchanged, which is what keeps every rule of an edit in force.
  async revert(record: ${ctx.modelPascalName}, entry: HistoryEntry${ctx.versioned ? ', expected: ExpectedVersion' : ''}) {
    const patch = revertPatchOf(entry.snapshot, HISTORY_REVERTIBLE_FIELDS);

    return HistoryOperationStorage.run('revert', () =>
      this.update(record, patch as unknown as Update${ctx.pascalName}Input${ctx.versioned ? ', expected' : ''}),
    );
  }
`;
}

export function historyPurgeCleanup(ctx: ResourceContext): string {
  return ctx.history
    ? `
    await authPrismaClient.recordSnapshot.deleteMany({
      where: { tenantId: record.tenantId, model: HISTORY_MODEL, recordId: record.id },
    });`
    : '';
}

function changedSampleFor(field: ScalarBlueprintField): string {
  switch (field.type) {
    case 'int':
      return '2';
    case 'boolean':
      return 'false';
    case 'datetime':
      return "'2020-01-01T00:00:00.000Z'";
    case 'file':
      return `'${field.name}-other.png'`;
    default:
      return `'${field.name}-changed'`;
  }
}

function historyCall(
  base: string,
  path: string,
  payload: string,
  token: string,
  status: number,
): string {
  return `await request(app.getHttpServer())
        .post(\`${base}/\${recordId}/history${path}\`)
        .set('Authorization', \`Bearer \${${token}}\`)
        .send(${payload})
        .expect(${status})`;
}

/**
 * The generated proof of the feature: one snapshot per write, none of a hidden
 * or encrypted field, a diff, a restore that goes through the update path, and
 * a refusal for whoever the preset does not cover. Runs against the real
 * database in CI like the rest of the generated suite.
 */
export function historySpecBlock(
  ctx: ResourceContext,
  createBody: string,
): string {
  if (!ctx.history || ctx.permissions.view === 'none') {
    return '';
  }

  const base = `/${ctx.pluralKebabName}`;
  const target = historyFields(ctx)[0];
  const excluded = ctx.fields
    .filter((field) => field.hidden || field.type === 'encrypted')
    .map((field) => `'${field.name}'`);
  const canRevert = ctx.permissions.update !== 'none';
  const versionPart = ctx.versioned ? ' version: 1,' : '';
  const create = `      const created = await request(app.getHttpServer())
        .post('${base}/create')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send({ data: [${createBody}] })
        .expect(201);

      const recordId = (
        created.body as { data: { status: string; data: { id: string } }[] }
      ).data[0]!.data.id;
`;
  const edit = target
    ? `
      await request(app.getHttpServer())
        .post('${base}/update')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send({ data: [{ id: recordId,${versionPart} ...${createBody}, ${target.name}: ${changedSampleFor(target)} }] })
        .expect(201);
`
    : '';
  const list = (limitPayload = '{}'): string =>
    historyCall(base, '', limitPayload, 'ownerToken', 200);

  const blocks: string[] = [
    `    it('stores a snapshot per write, newest first, without a hidden or encrypted field', async () => {
${create}${edit}
      const listed = ${list()};

      const entries = (listed.body as { data: Entry[] }).data;
      expect(entries.map((entry) => entry.operation)).toEqual([${target ? "'update', 'create'" : "'create'"}]);${
        target
          ? `\n      expect(entries[0]!.snapshot).toMatchObject({ ${target.name}: ${changedSampleFor(target)} });`
          : ''
      }${
        excluded.length > 0
          ? `\n      for (const name of [${excluded.join(', ')}]) {
        expect(entries[0]!.snapshot).not.toHaveProperty(name);
      }`
          : ''
      }
    });`,
    `    it('pages with limit and before', async () => {
${create}${edit}
      const first = ${list('{ limit: 1 }')};

      const firstPage = first.body as { data: Entry[]; meta: { nextBefore: number | null } };
      expect(firstPage.data).toHaveLength(1);
${
  target
    ? `      expect(firstPage.meta.nextBefore).not.toBeNull();

      const second = ${list('{ before: firstPage.meta.nextBefore }')};

      expect((second.body as { data: Entry[] }).data.map((entry) => entry.operation)).toEqual(['create']);`
    : `      expect(firstPage.meta.nextBefore).toBeNull();`
}
    });`,
    `    it('refuses an entry that does not exist', async () => {
${create}
      ${historyCall(base, '/diff', "{ from: 'not-an-entry' }", 'ownerToken', 404)};
    });`,
  ];

  if (target) {
    blocks.push(`    it('diffs an entry against the record as it is now', async () => {
${create}${edit}
      const listed = ${list()};
      const original = (listed.body as { data: Entry[] }).data[1]!;

      const diff = ${historyCall(base, '/diff', '{ from: original.id }', 'ownerToken', 200)};

      const changes = (diff.body as { data: { changes: { field: string; before: unknown; after: unknown }[] } }).data.changes;
      expect(changes).toContainEqual({
        field: '${target.name}',
        before: original.snapshot.${target.name},
        after: ${changedSampleFor(target)},
      });
    });`);

    if (canRevert) {
      blocks.push(`    it('restores an entry through the update path and records the restore', async () => {
${create}${edit}
      const listed = ${list()};
      const original = (listed.body as { data: Entry[] }).data[1]!;

      const restored = ${historyCall(base, '/restore', `{ snapshotId: original.id${ctx.versioned ? ', version: 2' : ''} }`, 'ownerToken', 201)};

      expect((restored.body as { data: Record<string, unknown> }).data.${target.name}).toEqual(original.snapshot.${target.name});

      const after = ${list()};
      expect((after.body as { data: Entry[] }).data.map((entry) => entry.operation)).toEqual(['revert', 'update', 'create']);
    });`);

      if (ctx.versioned) {
        blocks.push(`    it('refuses a restore made against a stale version', async () => {
${create}${edit}
      const listed = ${list()};
      const original = (listed.body as { data: Entry[] }).data[1]!;

      ${historyCall(base, '/restore', '{ snapshotId: original.id, version: 1 }', 'ownerToken', 409)};
    });`);
      }
    }
  }

  if (ctx.permissions.view === 'own') {
    blocks.push(`    it('refuses history to someone who cannot see the record', async () => {
${create}
      ${historyCall(base, '', '{}', 'strangerToken', 403)};
      ${historyCall(base, '/diff', "{ from: 'anything' }", 'strangerToken', 403)};
    });`);
  }

  if (ctx.permissions.update === 'own' && canRevert) {
    blocks.push(`    it('refuses a restore to someone who cannot update the record', async () => {
${create}
      ${historyCall(base, '/restore', "{ snapshotId: 'anything' }", 'strangerToken', 403)};
    });`);
  }

  return `  describe('history', () => {
    interface Entry {
      id: string;
      operation: string;
      snapshot: Record<string, unknown>;
    }

${blocks.join('\n\n')}
  });
`;
}
