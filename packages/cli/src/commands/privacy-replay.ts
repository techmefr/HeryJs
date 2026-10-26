import { projectAppModule } from '../lib/project-module';
import { NestFactory } from '@nestjs/core';
import type { Command } from 'commander';
import pc from 'picocolors';

/**
 * Loaded inside the call rather than at the top for the reason search:reindex
 * gives: the app module throws at import time on a bad environment, and that
 * must not break every other command.
 */
export async function replayErasures(): Promise<void> {
  const AppModule = projectAppModule();
  const { ErasureReplay } =
    await import('@heryjs/core/technical/privacy/erasure-replay');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const outcome = await app.get(ErasureReplay, { strict: false }).replay();

    console.log(
      pc.green(
        `replayed ${outcome.replayed} erasure(s), ${outcome.skipped} not present in this database`,
      ),
    );
  } finally {
    await app.close();
  }
}

export function registerPrivacyReplayCommand(program: Command): void {
  program
    .command('privacy:replay')
    .description(
      'Run every journaled erasure again, e.g. after restoring a dump taken before some of them',
    )
    .action(async () => {
      try {
        await replayErasures();
      } catch (error) {
        console.error(
          pc.red(error instanceof Error ? error.message : String(error)),
        );
        process.exitCode = 1;
      }
    });
}
