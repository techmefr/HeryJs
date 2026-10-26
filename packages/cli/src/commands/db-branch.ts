import type { Command } from 'commander';
import pc from 'picocolors';
import {
  branchDatabaseName,
  connectionUrlFor,
  createBranch,
  dropBranch,
  listBranches,
  maintenanceUrl,
  parseConnection,
} from '../lib/database';
import { requireDatabaseUrl, withClient } from '../lib/database-session';

export const BRANCH_ACTIONS = ['create', 'drop', 'list'] as const;

export type BranchAction = (typeof BRANCH_ACTIONS)[number];

export function isBranchAction(action: string): action is BranchAction {
  return (BRANCH_ACTIONS as readonly string[]).includes(action);
}

async function runAction(
  action: BranchAction,
  name: string | undefined,
): Promise<void> {
  const databaseUrl = requireDatabaseUrl();
  const { database: source } = parseConnection(databaseUrl);

  if (action !== 'list' && !name) {
    throw new Error(`db:branch ${action} needs a branch name.`);
  }

  await withClient(maintenanceUrl(databaseUrl), async (client) => {
    if (action === 'list') {
      const branches = await listBranches(client, source);
      console.log(branches.length === 0 ? 'No branches.' : branches.join('\n'));
      return;
    }

    const branchName = name as string;

    if (action === 'drop') {
      await dropBranch(client, source, branchName);
      console.log(
        pc.green(`dropped ${branchDatabaseName(source, branchName)}`),
      );
      return;
    }

    const target = await createBranch(client, source, branchName);
    console.log(pc.green(`created ${target}`));
    console.log('Point the app at it with:');
    console.log(`  DATABASE_URL="${connectionUrlFor(databaseUrl, target)}"`);
  });
}

export function registerDbBranchCommand(program: Command): void {
  program
    .command('db:branch <action> [name]')
    .description(
      'create, drop or list throwaway copies of the database (create | drop | list)',
    )
    .action(async (action: string, name: string | undefined) => {
      if (!isBranchAction(action)) {
        console.error(
          pc.red(
            `Unknown action "${action}". Use ${BRANCH_ACTIONS.join(', ')}.`,
          ),
        );
        process.exitCode = 1;
        return;
      }

      try {
        await runAction(action, name);
      } catch (error) {
        console.error(
          pc.red(error instanceof Error ? error.message : String(error)),
        );
        process.exitCode = 1;
      }
    });
}
