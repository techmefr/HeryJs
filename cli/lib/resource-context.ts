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
  kebabName: string;
  screamingSnakeName: string;
  pluralCamelName: string;
  pluralKebabName: string;
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

  return {
    pascalName,
    camelName,
    kebabName: kebabCase(pascalName),
    screamingSnakeName: screamingSnakeCase(pascalName),
    pluralCamelName: pluralize(camelName),
    pluralKebabName: pluralize(kebabCase(pascalName)),
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
