import type { InstallContext, LoadedModule } from './module-definition';
import {
  PRISMA_SCHEMA_FOLDER,
  modelNamesIn,
  moduleSchemaFile,
} from './schema-patch';
import { PACKAGE_MANIFEST, WORKSPACE_MANIFEST } from './project-patch';

export interface PatchRecord {
  module: string;
  file: string;
  /**
   * What has to be in the file once the patch has been applied: every
   * replacement an exact patch writes, every model an append declares, the
   * command a chained script ends with, the first field name added to a model.
   * Every write a module can make is a named operation, so every one of them
   * leaves a mark this can look for -- there is no freeform edit left whose
   * content only its own callback knows.
   */
  marks: string[];
  model?: string;
}

/**
 * Runs a module's `install()` against a context that writes nothing and only
 * records what it would patch. Safe to run over a project as it stands,
 * because a module can do nothing but call these methods -- none of them
 * import `node:fs`, which is the whole point of the context.
 */
export async function recordPatches(
  module: LoadedModule,
): Promise<PatchRecord[]> {
  const records: PatchRecord[] = [];

  const context: InstallContext = {
    touched: [],
    copyRuntime: () => undefined,
    copyPackageFile: () => undefined,
    nextSteps: () => undefined,

    addPrismaModels: (models) => {
      records.push({
        module: module.name,
        file: moduleSchemaFile(module.name),
        marks: modelNamesIn(models).map((name) => `model ${name} {`),
      });
    },

    addModelFields: (model, fields) => {
      const first = fields[0];

      records.push({
        module: module.name,
        file: PRISMA_SCHEMA_FOLDER,
        model,
        marks: first === undefined ? [] : [fieldNameIn(first)],
      });
    },

    chainScript: (_script, command) => {
      records.push({
        module: module.name,
        file: PACKAGE_MANIFEST,
        marks: [command],
      });
    },

    addWorkspace: (directory) => {
      records.push({
        module: module.name,
        file: WORKSPACE_MANIFEST,
        marks: [`'${directory}'`],
      });
    },

    patchExactStrings: (file, pairs) => {
      records.push({
        module: module.name,
        file,
        marks: pairs.map(([, replace]) => replace),
      });
    },
  };

  await module.install(context);

  return records;
}

export interface ModelFieldsWrite {
  model: string;
  fields: string[];
}

/**
 * The fields a module adds to models it does not own, as its install writes
 * them, so uninstalling can take back exactly those.
 */
export async function recordModelFields(
  module: LoadedModule,
): Promise<ModelFieldsWrite[]> {
  const writes: ModelFieldsWrite[] = [];
  const ignore = () => undefined;

  await module.install({
    touched: [],
    copyRuntime: ignore,
    copyPackageFile: ignore,
    nextSteps: ignore,
    addPrismaModels: ignore,
    addModelFields: (model, fields) => {
      writes.push({ model, fields });
    },
    chainScript: ignore,
    addWorkspace: ignore,
    patchExactStrings: ignore,
  });

  return writes;
}

/**
 * A Prisma field line is `name Type @attrs`, and `prisma format` realigns the
 * columns of the whole block whenever anything else in it changes -- so the
 * name is the only part of the line worth matching on.
 */
function fieldNameIn(fieldLine: string): string {
  return fieldLine.trim().split(/\s+/)[0] ?? '';
}

function modelBlock(source: string, model: string): string | undefined {
  const start = source.indexOf(`model ${model} {`);

  if (start === -1) {
    return undefined;
  }

  const close = source.indexOf('\n}', start);

  return source.slice(start, close === -1 ? undefined : close);
}

/**
 * The marks a module left on the project that are no longer there. A patch
 * whose search text a kernel refactor has moved on from does not fail loudly:
 * `patchExactStrings` throws only when its guard is absent, so on an installed
 * project the whole patch is skipped as "already applied" and the module quietly
 * stops extending anything. That is how impersonation shipped a hardcoded
 * session duration while every check here was green.
 */
export function missingMarks(
  records: PatchRecord[],
  read: (file: string) => string | undefined,
): string[] {
  return records.flatMap((record) => {
    const source = read(record.file);

    if (source === undefined) {
      return [`${record.module} patches ${record.file}, which is not there`];
    }

    const haystack =
      record.model === undefined
        ? source
        : (modelBlock(source, record.model) ?? '');

    if (record.model !== undefined && haystack === '') {
      return [
        `${record.module} patches model ${record.model} in ${record.file}, which holds no such model`,
      ];
    }

    return record.marks
      .filter((mark) => !haystack.includes(mark))
      .map(
        (mark) =>
          `${record.module} patches ${record.file}, and what it writes is not there: ${JSON.stringify(tellingLine(mark, haystack))}`,
      );
  });
}

/**
 * What to quote back out of a patch that did not land. A replacement routinely
 * spans a dozen lines of which only one or two are the module's own, so the
 * first line the file does not hold is the line worth reading -- quoting the
 * first line of the block instead names whatever the module happened to anchor
 * on, which is the part that is still there.
 */
function tellingLine(mark: string, haystack: string): string {
  const lines = mark.split('\n').map((line) => line.trim());
  const absent = lines.find((line) => line !== '' && !haystack.includes(line));

  return truncate(absent ?? lines[0] ?? '');
}

function truncate(line: string): string {
  return line.length > 70 ? `${line.slice(0, 70)}…` : line;
}
