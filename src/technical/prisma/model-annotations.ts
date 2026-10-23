import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

export const ANNOTATIONS_FILE = 'hery-annotations.json';
export const ANNOTATION_PREFIX = '@hery.';

export interface AnnotatedField {
  name: string;
  documentation: string | null;
}

export interface AnnotatedModel {
  name: string;
  documentation: string | null;
  fields: readonly AnnotatedField[];
}

export interface ModelRegistries {
  tenantScoped: ReadonlySet<string>;
  tenantFree: ReadonlySet<string>;
  appEnforcedTenant: ReadonlySet<string>;
  audited: ReadonlySet<string>;
  history: ReadonlySet<string>;
  encrypted: ReadonlySet<string>;
}

const MODEL_ANNOTATIONS = {
  tenantScoped: { reason: false },
  tenantFree: { reason: true },
  appEnforcedTenant: { reason: true },
  audited: { reason: false },
} as const;

const FIELD_ANNOTATIONS = {
  history: { reason: false },
  encrypted: { reason: false },
} as const;

type ModelAnnotation = keyof typeof MODEL_ANNOTATIONS;
type FieldAnnotation = keyof typeof FIELD_ANNOTATIONS;

const ANNOTATION_LINE = /^@hery\.(\w+)(?:\s+(.*))?$/;
const TENANT_COLUMN = 'tenantId';

function annotationsIn(
  documentation: string | null,
  allowed: Record<string, { reason: boolean }>,
  where: string,
): Map<string, string> {
  const found = new Map<string, string>();

  for (const line of (documentation ?? '').split('\n')) {
    const trimmed = line.trim();

    if (!trimmed.startsWith(ANNOTATION_PREFIX)) {
      continue;
    }

    const match = ANNOTATION_LINE.exec(trimmed);
    const name = match?.[1] ?? '';
    const reason = (match?.[2] ?? '').trim();
    const rule = allowed[name];

    if (!rule) {
      throw new Error(
        `${where} carries an unknown annotation "${trimmed}" (expected one of ${Object.keys(
          allowed,
        )
          .map((known) => `${ANNOTATION_PREFIX}${known}`)
          .join(', ')})`,
      );
    }

    if (rule.reason && reason === '') {
      throw new Error(
        `${where} is ${ANNOTATION_PREFIX}${name} without a reason: write why next to it, as in "/// ${ANNOTATION_PREFIX}${name} <reason>"`,
      );
    }

    found.set(name, reason);
  }

  return found;
}

export function registriesFrom(
  models: readonly AnnotatedModel[],
): ModelRegistries {
  const byModel: Record<ModelAnnotation, Set<string>> = {
    tenantScoped: new Set(),
    tenantFree: new Set(),
    appEnforcedTenant: new Set(),
    audited: new Set(),
  };
  const byField: Record<FieldAnnotation, Set<string>> = {
    history: new Set(),
    encrypted: new Set(),
  };

  for (const model of models) {
    for (const name of annotationsIn(
      model.documentation,
      MODEL_ANNOTATIONS,
      `model ${model.name}`,
    ).keys()) {
      byModel[name as ModelAnnotation].add(model.name);
    }

    for (const field of model.fields) {
      for (const name of annotationsIn(
        field.documentation,
        FIELD_ANNOTATIONS,
        `field ${model.name}.${field.name}`,
      ).keys()) {
        byField[name as FieldAnnotation].add(`${model.name}.${field.name}`);
      }
    }
  }

  return { ...byModel, ...byField };
}

export function tenantBoundaryProblems(
  models: readonly AnnotatedModel[],
  registries: ModelRegistries,
): string[] {
  const problems: string[] = [];

  for (const model of models) {
    const carriesTenant = model.fields.some(
      (field) => field.name === TENANT_COLUMN,
    );
    const scoped = registries.tenantScoped.has(model.name);
    const appEnforced = registries.appEnforcedTenant.has(model.name);

    if (carriesTenant && !scoped && !appEnforced) {
      problems.push(
        `${model.name} carries a tenantId but is neither /// ${ANNOTATION_PREFIX}tenantScoped nor /// ${ANNOTATION_PREFIX}appEnforcedTenant <reason> — annotate it in prisma/schema.prisma`,
      );
    }

    if (scoped && appEnforced) {
      problems.push(
        `${model.name} is both ${ANNOTATION_PREFIX}tenantScoped and ${ANNOTATION_PREFIX}appEnforcedTenant — it can only be one`,
      );
    }

    if (!carriesTenant && (scoped || appEnforced)) {
      problems.push(
        `${model.name} is annotated as a tenant model but has no tenantId column — the annotation claims a boundary the table cannot hold`,
      );
    }

    if (carriesTenant && registries.tenantFree.has(model.name)) {
      problems.push(
        `${model.name} is ${ANNOTATION_PREFIX}tenantFree but does carry a tenantId — decide which of the two it is`,
      );
    }
  }

  return problems;
}

const MODEL_DECLARATION = /^model\s+(\w+)\s*\{/;
const FIELD_DECLARATION = /^(\w+)\s+\S/;

/**
 * The same models Prisma's DMMF describes, read from the schema text: name,
 * `///` documentation and fields. The convention checks run before any
 * `prisma generate`, so they read the schema the way the generator does.
 */
export function annotatedModelsIn(schemaSource: string): AnnotatedModel[] {
  const models: AnnotatedModel[] = [];
  let fields: AnnotatedField[] | null = null;
  let docs: string[] = [];

  const documentation = () => (docs.length > 0 ? docs.join('\n') : null);

  for (const raw of schemaSource.split('\n')) {
    const line = raw.trim();

    if (line.startsWith('///')) {
      docs.push(line.slice(3).trim());
      continue;
    }

    if (line === '' || line.startsWith('//')) {
      continue;
    }

    if (fields === null) {
      const model = MODEL_DECLARATION.exec(line);

      if (model) {
        fields = [];
        models.push({
          name: model[1] ?? '',
          documentation: documentation(),
          fields,
        });
      }
    } else if (line === '}') {
      fields = null;
    } else {
      const field = FIELD_DECLARATION.exec(line);

      if (field && !line.startsWith('@@')) {
        fields.push({ name: field[1] ?? '', documentation: documentation() });
      }
    }

    docs = [];
  }

  return models;
}

function annotationsFile(): string {
  return path.join(
    path.dirname(require.resolve('@prisma/client')),
    ANNOTATIONS_FILE,
  );
}

export function readGeneratedModels(
  file: string = annotationsFile(),
): AnnotatedModel[] {
  if (!existsSync(file)) {
    throw new Error(
      `Found no ${ANNOTATIONS_FILE} next to the Prisma client. The schema declares the tenant boundary, audit, history and encryption as /// ${ANNOTATION_PREFIX}* annotations, and the kernel refuses to start without them: add the "hery" generator to prisma/schema.prisma and run "prisma generate".`,
    );
  }

  return (
    JSON.parse(readFileSync(file, 'utf8')) as { models: AnnotatedModel[] }
  ).models;
}

export function validatedRegistries(
  models: readonly AnnotatedModel[],
): ModelRegistries {
  const registries = registriesFrom(models);
  const problems = tenantBoundaryProblems(models, registries);

  if (problems.length > 0) {
    throw new Error(
      `The tenant boundary is not declared for every model:\n  ${problems.join('\n  ')}`,
    );
  }

  return registries;
}

let loaded: ModelRegistries | null = null;

export function modelRegistries(): ModelRegistries {
  loaded ??= validatedRegistries(readGeneratedModels());
  return loaded;
}
