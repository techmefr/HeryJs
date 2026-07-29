import { Command } from 'commander';
import { registerCreateBlueprintCommand } from './commands/create-blueprint';
import { registerGenerateCommand } from './commands/generate';
import { registerMigrateCommand } from './commands/migrate';

const program = new Command();

program.name('hery').description('HeryJs conventions CLI');

registerCreateBlueprintCommand(program);
registerGenerateCommand(program);
registerMigrateCommand(program);

void program.parseAsync(process.argv);
