import '#technical/config/load-env';
import { Command } from 'commander';
import { registerConsoleCommand } from './commands/console';
import { registerCreateBlueprintCommand } from './commands/create-blueprint';
import { registerDoctorCommand } from './commands/doctor';
import { registerEnvCommand } from './commands/env';
import { registerExposeListCommand } from './commands/expose-list';
import { registerExposeRunCommand } from './commands/expose-run';
import { registerGenerateCommand } from './commands/generate';
import { registerHostsCommand } from './commands/hosts';
import { registerInstallCommand } from './commands/install';
import { registerLintCommand } from './commands/lint';
import { registerMcpServeCommand } from './commands/mcp-serve';
import { registerMigrateCommand } from './commands/migrate';
import { registerModuleListCommand } from './commands/module-list';
import { registerModuleMonitoringCommand } from './commands/module-monitoring';
import { registerNewCommand } from './commands/new';
import { registerSearchReindexCommand } from './commands/search-reindex';
import { registerUninstallCommand } from './commands/uninstall';
import { registerUpCommand } from './commands/up';

const program = new Command();

program.name('hery').description('HeryJs conventions CLI');

registerConsoleCommand(program);
registerCreateBlueprintCommand(program);
registerDoctorCommand(program);
registerEnvCommand(program);
registerExposeListCommand(program);
registerExposeRunCommand(program);
registerGenerateCommand(program);
registerHostsCommand(program);
registerInstallCommand(program);
registerLintCommand(program);
registerMcpServeCommand(program);
registerMigrateCommand(program);
registerModuleListCommand(program);
registerModuleMonitoringCommand(program);
registerNewCommand(program);
registerSearchReindexCommand(program);
registerUninstallCommand(program);
registerUpCommand(program);

void program.parseAsync(process.argv);
