import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { kebabCase, pascalCase } from './naming';

export interface ResourceRoute {
  method: string;
  path: string;
  handler: string;
  capability?: string;
}

export interface ResourceField {
  name: string;
  prismaType: string;
  optional: boolean;
  hidden: boolean;
}

export interface ResourceDescription {
  name: string;
  routes: ResourceRoute[];
  fields: ResourceField[];
}

function functionalDir(): string {
  return path.resolve(process.cwd(), 'src', 'functional');
}

function findResourceDirs(): string[] {
  const root = functionalDir();

  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function listResources(): string[] {
  return findResourceDirs()
    .filter((dir) =>
      existsSync(path.join(functionalDir(), dir, `${dir}.controller.ts`)),
    )
    .map((dir) => pascalCase(dir));
}

function decoratorCallee(decorator: ts.Decorator): string | undefined {
  const expr = decorator.expression;
  const callee = ts.isCallExpression(expr) ? expr.expression : expr;
  return ts.isIdentifier(callee) ? callee.text : undefined;
}

function decoratorFirstArgText(decorator: ts.Decorator): string | undefined {
  const expr = decorator.expression;

  if (!ts.isCallExpression(expr) || expr.arguments.length === 0) {
    return undefined;
  }

  const [arg] = expr.arguments;

  if (!arg) {
    return undefined;
  }

  if (ts.isStringLiteral(arg)) {
    return arg.text;
  }

  if (ts.isIdentifier(arg)) {
    return arg.text;
  }

  return undefined;
}

const HTTP_DECORATORS = new Set(['Get', 'Post', 'Patch', 'Put', 'Delete']);

function parseControllerRoutes(filePath: string): ResourceRoute[] {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

  const routes: ResourceRoute[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      const decorators = ts.getDecorators?.(node) ?? [];
      const httpDecorator = decorators.find((decorator) => {
        const name = decoratorCallee(decorator);
        return name !== undefined && HTTP_DECORATORS.has(name);
      });

      if (httpDecorator) {
        const capabilityDecorator = decorators.find(
          (decorator) => decoratorCallee(decorator) === 'Capability',
        );

        routes.push({
          method: decoratorCallee(httpDecorator) as string,
          path: decoratorFirstArgText(httpDecorator) ?? '',
          handler: node.name.text,
          capability: capabilityDecorator
            ? decoratorFirstArgText(capabilityDecorator)
            : undefined,
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return routes;
}

function parsePrismaFields(modelName: string): ResourceField[] {
  const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');

  if (!existsSync(schemaPath)) {
    return [];
  }

  const schema = readFileSync(schemaPath, 'utf8');
  const modelMatch = new RegExp(
    `model ${modelName} \\{([\\s\\S]*?)\\n\\}`,
  ).exec(schema);

  const body = modelMatch?.[1];

  if (!body) {
    return [];
  }

  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('@@'))
    .map((line) => {
      const [name, rawType] = line.split(/\s+/) as [string, string];
      const optional = rawType.endsWith('?');
      return {
        name,
        prismaType: optional ? rawType.slice(0, -1) : rawType,
        optional,
        hidden: false,
      };
    });
}

function parseHiddenFields(resourceDir: string, kebabName: string): string[] {
  const viewPath = path.join(
    functionalDir(),
    resourceDir,
    `${kebabName}.view.ts`,
  );

  if (!existsSync(viewPath)) {
    return [];
  }

  const match = /const \{ ([^}]+), \.\.\.view \} = record;/.exec(
    readFileSync(viewPath, 'utf8'),
  );

  const names = match?.[1];

  if (!names) {
    return [];
  }

  return names.split(',').map((name) => name.trim());
}

export function describeResource(name: string): ResourceDescription | null {
  const resourceDir = findResourceDirs().find(
    (dir) => pascalCase(dir) === name || dir === kebabCase(name),
  );

  if (!resourceDir) {
    return null;
  }

  const controllerPath = path.join(
    functionalDir(),
    resourceDir,
    `${resourceDir}.controller.ts`,
  );

  if (!existsSync(controllerPath)) {
    return null;
  }

  const pascalName = pascalCase(resourceDir);
  const hiddenFields = new Set(parseHiddenFields(resourceDir, resourceDir));

  const fields = parsePrismaFields(pascalName).map((field) => ({
    ...field,
    hidden: hiddenFields.has(field.name),
  }));

  return {
    name: pascalName,
    routes: parseControllerRoutes(controllerPath),
    fields,
  };
}
