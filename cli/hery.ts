import { runCreateBlueprint } from './commands/create-blueprint';
import { runGenerate } from './commands/generate';
import { runMigrate } from './commands/migrate';

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case 'create:blueprint':
    runCreateBlueprint(rest);
    break;
  case 'generate':
    runGenerate(rest);
    break;
  case 'migrate':
    runMigrate(rest);
    break;
  default:
    console.error(`Unknown command: ${command ?? '(none)'}`);
    console.error('Available commands: create:blueprint, generate, migrate');
    process.exitCode = 1;
}
