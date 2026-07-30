import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { registerCreateBlueprintCommand } from './commands/create-blueprint';
import { registerGenerateCommand } from './commands/generate';
import { registerHostsCommand } from './commands/hosts';
import { registerMcpServeCommand } from './commands/mcp-serve';
import { registerMigrateCommand } from './commands/migrate';
import { registerModuleMonitoringCommand } from './commands/module-monitoring';
import { registerUpCommand } from './commands/up';

const envPath = path.resolve(process.cwd(), '.env');

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const program = new Command();

program.name('hery').description('HeryJs conventions CLI');

registerCreateBlueprintCommand(program);
registerGenerateCommand(program);
registerHostsCommand(program);
registerMcpServeCommand(program);
registerMigrateCommand(program);
registerModuleMonitoringCommand(program);
registerUpCommand(program);

void program.parseAsync(process.argv);
