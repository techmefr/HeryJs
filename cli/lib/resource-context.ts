import {
  camelCase,
  kebabCase,
  pascalCase,
  pluralize,
  screamingSnakeCase,
} from './naming';
import type { Blueprint } from './blueprint';

export interface ResourceContext {
  pascalName: string;
  camelName: string;
  /** The Prisma model these routes act on -- the resource's own unless the blueprint names another. */
  modelPascalName: string;
  modelCamelName: string;
  version: number;
  /** Where the controller mounts: plural for version 1, v<n>/plural above it. */
  routePath: string;
  /** True when this resource owns the model, and so is the one that declares it in the schema. */
  ownsModel: boolean;
  kebabName: string;
  screamingSnakeName: string;
  pluralCamelName: string;
  pluralKebabName: string;
  softDeletes: Blueprint['softDeletes'];
  fields: Blueprint['fields'];
  permissions: Blueprint['permissions'];
  pagination: Blueprint['pagination'];
  sorts: Blueprint['sorts'];
  filters: Blueprint['filters'];
  includes: Blueprint['includes'];
  aggregates: Blueprint['aggregates'];
  relations: Blueprint['relations'];
}

export function buildResourceContext(blueprint: Blueprint): ResourceContext {
  const pascalName = pascalCase(blueprint.name);
  const camelName = camelCase(pascalName);
  const modelPascalName = blueprint.model ?? pascalName;
  const pluralKebabName = pluralize(kebabCase(pascalName));

  return {
    pascalName,
    camelName,
    modelPascalName,
    modelCamelName: camelCase(modelPascalName),
    version: blueprint.version,
    routePath:
      blueprint.version === 1
        ? pluralKebabName
        : `v${blueprint.version}/${pluralKebabName}`,
    ownsModel: modelPascalName === pascalName,
    kebabName: kebabCase(pascalName),
    screamingSnakeName: screamingSnakeCase(pascalName),
    pluralCamelName: pluralize(camelName),
    pluralKebabName,
    softDeletes: blueprint.softDeletes,
    fields: blueprint.fields,
    permissions: blueprint.permissions,
    pagination: blueprint.pagination,
    sorts: blueprint.sorts,
    filters: blueprint.filters,
    includes: blueprint.includes,
    aggregates: blueprint.aggregates,
    relations: blueprint.relations,
  };
}
