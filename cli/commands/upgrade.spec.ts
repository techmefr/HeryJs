import { Command } from 'commander';
import { registerUpgradeCommand, runUpgrade } from './upgrade';

describe('hery upgrade', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.exitCode = undefined;
    jest.restoreAllMocks();
  });

  it('runs kernel:migrate then check', () => {
    const calls: string[] = [];

    const status = runUpgrade((args) => {
      calls.push(args.join(' '));
      return 0;
    });

    expect(status).toBe(0);
    expect(calls).toEqual(['kernel:migrate', 'check']);
  });

  it('stops at the first failing step and returns its status', () => {
    const calls: string[] = [];

    const status = runUpgrade((args) => {
      calls.push(args.join(' '));
      return 1;
    });

    expect(status).toBe(1);
    expect(calls).toEqual(['kernel:migrate']);
  });

  it('sets the exit code when a step fails', async () => {
    const program = new Command();
    registerUpgradeCommand(program, (args) => (args[0] === 'check' ? 2 : 0));

    await program.parseAsync(['node', 'hery', 'upgrade']);

    expect(process.exitCode).toBe(2);
  });
});
