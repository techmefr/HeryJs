import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as readline from 'node:readline/promises';
import type { Command } from 'commander';
import pc from 'picocolors';

const HOSTNAME = 'heryjs.local';
const ENTRY = `127.0.0.1 ${HOSTNAME}`;

function hostsFilePath(): string {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
    return `${systemRoot}\\System32\\drivers\\etc\\hosts`;
  }

  return '/etc/hosts';
}

function alreadyPresent(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }

  return readFileSync(path, 'utf-8')
    .split('\n')
    .some((line) => line.includes(HOSTNAME) && !line.trim().startsWith('#'));
}

function appendUnix(path: string): boolean {
  const result = spawnSync('sudo', ['tee', '-a', path], {
    input: `${ENTRY}\n`,
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  return result.status === 0;
}

function appendWindows(path: string): boolean {
  const command = `Add-Content -Path '${path}' -Value '${ENTRY}'`;

  const result = spawnSync('powershell.exe', [
    '-Command',
    `Start-Process powershell -Verb RunAs -ArgumentList '-Command "${command}"' -Wait`,
  ]);

  return result.status === 0;
}

export function registerHostsCommand(program: Command): void {
  program
    .command('hosts')
    .description(`Add ${HOSTNAME} to the local hosts file (for Portless)`)
    .action(async () => {
      const path = hostsFilePath();

      if (alreadyPresent(path)) {
        console.log(pc.green(`✔ ${HOSTNAME} is already in ${path}`));
        return;
      }

      console.log(`This will add the following line to ${pc.bold(path)}:`);
      console.log(pc.dim(`  ${ENTRY}`));
      console.log(
        pc.dim(
          process.platform === 'win32'
            ? '(a Windows admin prompt will appear)'
            : '(you will be asked for your sudo password)',
        ),
      );

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const answer = await rl.question('Proceed? (y/N) ');
      rl.close();

      if (answer.trim().toLowerCase() !== 'y') {
        console.log('Cancelled.');
        return;
      }

      const ok =
        process.platform === 'win32' ? appendWindows(path) : appendUnix(path);

      if (ok) {
        console.log(pc.green(`✔ ${HOSTNAME} added to ${path}`));
      } else {
        console.log(pc.red(`✘ Could not update ${path}`));
        process.exitCode = 1;
      }
    });
}
