import { existsSync } from 'node:fs';
import * as path from 'node:path';

/**
 * Imported for its side effect, and always first, because env.ts parses
 * process.env in its module body: anything that loads the schema before this
 * has run sees an empty environment and throws. Prisma reads .env through its
 * own loader, which is why "prisma migrate dev" worked while the very next
 * command in the README could not boot.
 *
 * process.loadEnvFile is Node's own reader, so there is no dependency here and
 * nothing to keep in sync with a parser someone else maintains. Values already
 * present in the environment win, which keeps a deliberate override -- CI, a
 * one-off DATABASE_URL in front of a command -- ahead of the file on disk.
 */
const envPath = path.resolve(process.cwd(), '.env');

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
