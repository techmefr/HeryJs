import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../../../cli/lib/module-registry';
import { copyRuntime } from '../../../cli/lib/runtime-copy';

const COMPOSE_FILE = 'docker-compose.stream.yml';
const RUNTIME_DIR = path.join(__dirname, 'runtime');
const DEST_DIR = 'src/modules/stream';

registerModule({
  name: 'stream',
  description:
    'Add one-to-many audio/video streaming via LiveKit (SFU). Use "hery generate <Name> --stream" to add publish/viewer token endpoints to a resource.',
  dependencies: ['livekit-server-sdk'],
  install() {
    if (existsSync(COMPOSE_FILE)) {
      console.log(pc.yellow(`${COMPOSE_FILE} already exists, skipping.`));
    } else {
      writeFileSync(
        COMPOSE_FILE,
        readFileSync(path.join(__dirname, '..', COMPOSE_FILE), 'utf8'),
      );
      console.log(pc.green(`✔ ${COMPOSE_FILE}`));
    }

    copyRuntime(RUNTIME_DIR, DEST_DIR);

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(
      `  1. Run "docker compose -f docker-compose.stream.yml up -d" (dev mode, key "devkey"/"secret")`,
    );
    console.log(
      `  2. Run "hery generate <Name> --stream" to add publish/viewer token endpoints to a resource`,
    );
    console.log(
      `  3. Import ${pc.bold('StreamModule')} and add ${pc.bold('<Name>StreamController')} to <name>.module.ts`,
    );
  },
});
