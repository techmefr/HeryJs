import { camelCase, kebabCase, pascalCase, pluralize } from './naming';
import type { Blueprint } from './blueprint';

export interface ResourceContext {
  pascalName: string;
  camelName: string;
  kebabName: string;
  pluralCamelName: string;
  pluralKebabName: string;
  fields: Blueprint['fields'];
  permissions: Blueprint['permissions'];
}

export function buildResourceContext(blueprint: Blueprint): ResourceContext {
  const pascalName = pascalCase(blueprint.name);
  const camelName = camelCase(pascalName);

  return {
    pascalName,
    camelName,
    kebabName: kebabCase(pascalName),
    pluralCamelName: pluralize(camelName),
    pluralKebabName: pluralize(kebabCase(pascalName)),
    fields: blueprint.fields,
    permissions: blueprint.permissions,
  };
}
