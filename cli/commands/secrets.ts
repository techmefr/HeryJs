import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Command } from 'commander';
import pc from 'picocolors';

interface RotateOptions {
  dryRun?: boolean;
  adoptPlaintext?: boolean;
  tenant?: string;
  batchSize: string;
}

export function registerSecretsCommands(program: Command): void {
  program
    .command('secrets:key')
    .description(
      'Print a new 32-byte key, ready to append to SECRETS_KEYS as <id>:<key>',
    )
    .action(async () => {
      const { generateSecretKey } = await import('#technical/secrets/keyring');

      console.log(generateSecretKey());
    });

  program
    .command('secrets:rotate')
    .description(
      'Re-encrypt every encrypted column to the active key, so an old key can be retired from SECRETS_KEYS',
    )
    .option('--dry-run', 'count what would change without writing anything')
    .option(
      '--adopt-plaintext',
      'also encrypt values that were stored before the column became encrypted',
    )
    .option('--tenant <id>', 'rotate one tenant only')
    .option('--batch-size <rows>', 'rows read per query', '200')
    .action(async (options: RotateOptions) => {
      const { env } = await import('#technical/config/env');
      const { defaultKeyring } =
        await import('#technical/secrets/default-keyring');
      const { rotateSecrets } =
        await import('#technical/secrets/secrets-rotation');

      const keyring = defaultKeyring();
      const batchSize = Number.parseInt(options.batchSize, 10);

      if (!Number.isInteger(batchSize) || batchSize < 1) {
        console.error(pc.red('--batch-size must be a positive integer'));
        process.exitCode = 1;
        return;
      }

      const client = new PrismaClient({
        adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
      });

      try {
        const reports = await rotateSecrets(client, keyring, {
          batchSize,
          dryRun: options.dryRun ?? false,
          adoptPlaintext: options.adoptPlaintext ?? false,
          tenantId: options.tenant,
        });

        if (reports.length === 0) {
          console.log(
            pc.yellow('No encrypted column declared, nothing to do.'),
          );
          return;
        }

        const verb = options.dryRun ? 'would re-encrypt' : 're-encrypted';

        for (const report of reports) {
          console.log(
            `${report.model}.${report.column}: ${verb} ${report.rotated}, ${report.alreadyCurrent} already on key ${keyring.activeKeyId}` +
              (report.adopted > 0
                ? `, adopted ${report.adopted} plaintext`
                : '') +
              (report.plaintextSkipped > 0
                ? `, ${report.plaintextSkipped} plaintext left alone (use --adopt-plaintext)`
                : ''),
          );
        }

        console.log(
          pc.green(
            options.dryRun
              ? '✔ dry run finished, nothing was written'
              : `✔ every value now uses key ${keyring.activeKeyId}, older keys can be removed from SECRETS_KEYS`,
          ),
        );
      } catch (error) {
        console.error(
          pc.red(`secrets:rotate stopped: ${(error as Error).message}`),
        );
        process.exitCode = 1;
      } finally {
        await client.$disconnect();
      }
    });
}
