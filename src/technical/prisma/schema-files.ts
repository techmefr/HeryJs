import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

export const PRISMA_SCHEMA_DIR = path.join('prisma', 'schema');

function prismaFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return prismaFilesUnder(full);
    }

    return entry.name.endsWith('.prisma') ? [full] : [];
  });
}

/**
 * Every file of the schema folder: the kernel's under _hery/, one per module,
 * and the project's own. Prisma reads them as one schema, so anything that
 * reasons about models reads them the same way.
 */
export function prismaSchemaFiles(root: string): string[] {
  return prismaFilesUnder(path.join(root, PRISMA_SCHEMA_DIR)).sort();
}

export function readPrismaSchema(root: string): string | undefined {
  const files = prismaSchemaFiles(root);

  if (files.length === 0) {
    return undefined;
  }

  return `${files.map((file) => readFileSync(file, 'utf8').trimEnd()).join('\n\n')}\n`;
}

export function schemaFileDeclaring(
  root: string,
  model: string,
): string | undefined {
  const declaration = new RegExp(`^model\\s+${model}\\s*\\{`, 'm');

  return prismaSchemaFiles(root).find((file) =>
    declaration.test(readFileSync(file, 'utf8')),
  );
}
