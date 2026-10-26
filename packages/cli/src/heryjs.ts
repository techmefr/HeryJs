#!/usr/bin/env node
import { Command } from 'commander';
import { registerNewCommand } from './commands/new';
import { KERNEL_VERSION } from './lib/kernel-version';

/**
 * The published entry point, and deliberately not the whole CLI.
 *
 * `hery` is a command inside a project: sixty-eight of its imports reach the
 * kernel through `#technical/`, and every command past `new` reads a schema, a
 * blueprint or a running database that only exists once a project does. So
 * what ships on npm is the one command that runs before there is a project,
 * and it hands the rest over: the CLI travels into the project it creates, and
 * is run from there as `pnpm hery`.
 */
const program = new Command();

program
  .name('heryjs')
  .description(
    'Scaffold a HeryJs project. Every other command lives inside the project this creates, as "pnpm hery".',
  )
  .version(KERNEL_VERSION);

registerNewCommand(program);

program.parse();
