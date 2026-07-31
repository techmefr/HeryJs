import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../../../cli/lib/module-registry';
import { copyRuntime } from '../../../cli/lib/runtime-copy';

const RUNTIME_DIR = path.join(__dirname, 'runtime');
const DEST_DIR = 'src/technical';

registerModule({
  name: 'graphql',
  channel: 'official',
  description:
    'Add a GraphQL endpoint (Apollo driver) with a session guard mirroring the REST auth flow. Use "hery generate <Name> --graphql" to add a resolver to a resource.',
  dependencies: [
    '@nestjs/graphql',
    '@nestjs/apollo',
    '@apollo/server',
    '@as-integrations/express5',
    'graphql',
  ],
  install() {
    copyRuntime(RUNTIME_DIR, DEST_DIR);

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(
      `  1. Import ${pc.bold('GraphqlModule')} into src/app.module.ts`,
    );
    console.log(
      `  2. Run "hery generate <Name> --graphql" to add a resolver to a resource`,
    );
  },
});
