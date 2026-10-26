import { createRequire } from 'node:module';
import * as path from 'node:path';
import type { Type } from '@nestjs/common';

/**
 * The AppModule of the project the CLI runs in, resolved through that
 * project's own `#app.module` import rather than this package's: the CLI is
 * installed under node_modules, and the module it boots is the project's.
 */
export function projectAppModule(root: string = process.cwd()): Type {
  const load = createRequire(path.join(root, 'package.json'));

  return (load('#app.module') as { AppModule: Type }).AppModule;
}
