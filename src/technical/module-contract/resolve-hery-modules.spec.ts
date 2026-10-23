import { Module } from '@nestjs/common';
import { z } from 'zod';
import { defineHeryModule, noOptions } from './hery-module.contract';
import {
  HeryModuleConfigError,
  resolveHeryModules,
} from './resolve-hery-modules';

@Module({})
class MailTestModule {}

@Module({})
class ResendTestModule {}

@Module({})
class ChannelTestModule {}

const mail = defineHeryModule({
  name: '@heryjs/mail',
  module: () => MailTestModule,
  options: noOptions,
});

const resend = defineHeryModule({
  name: '@heryjs/mail-resend',
  module: () => ResendTestModule,
  options: noOptions,
  requires: ['@heryjs/mail'],
});

const channel = defineHeryModule({
  name: '@acme/channel',
  module: (options: { retries: number }) => ({
    module: ChannelTestModule,
    providers: [{ provide: 'RETRIES', useValue: options.retries }],
  }),
  options: z.object({ retries: z.number().int().min(0) }).strict(),
});

const installed = [mail, resend, channel];

function errorOf(run: () => unknown): HeryModuleConfigError {
  try {
    run();
  } catch (error) {
    return error as HeryModuleConfigError;
  }

  throw new Error('expected the resolution to throw');
}

describe('resolveHeryModules', () => {
  it('imports what each declared module returns, in the declared order', () => {
    const imports = resolveHeryModules(
      [
        '@heryjs/mail-resend',
        '@heryjs/mail',
        ['@acme/channel', { retries: 2 }],
      ],
      installed,
    );

    expect(imports).toEqual([
      ResendTestModule,
      MailTestModule,
      {
        module: ChannelTestModule,
        providers: [{ provide: 'RETRIES', useValue: 2 }],
      },
    ]);
  });

  it('wires nothing when no module is declared', () => {
    expect(resolveHeryModules([], installed)).toEqual([]);
  });

  it('stops on a module that is not installed, and says how to install it', () => {
    const error = errorOf(() =>
      resolveHeryModules(['@heryjs/mail', '@heryjs/sso'], installed),
    );

    expect(error).toBeInstanceOf(HeryModuleConfigError);
    expect(error.message).toContain(
      '@heryjs/sso: unknown module, it is not installed. Run "hery install sso"',
    );
  });

  it('stops on options the module schema refuses, naming the field', () => {
    const error = errorOf(() =>
      resolveHeryModules([['@acme/channel', { retries: -1 }]], installed),
    );

    expect(error).toBeInstanceOf(HeryModuleConfigError);
    expect(error.message).toContain('@acme/channel: invalid options, retries:');
  });

  it('stops on an option the module does not declare', () => {
    const error = errorOf(() =>
      resolveHeryModules([['@heryjs/mail', { driver: 'smtp' }]], installed),
    );

    expect(error.message).toContain('@heryjs/mail: invalid options');
  });

  it('stops on a required module that is not declared', () => {
    const error = errorOf(() =>
      resolveHeryModules(['@heryjs/mail-resend'], installed),
    );

    expect(error).toBeInstanceOf(HeryModuleConfigError);
    expect(error.message).toContain(
      '@heryjs/mail-resend: requires @heryjs/mail, which hery.config.ts does not declare',
    );
  });

  it('stops on a module declared twice', () => {
    const error = errorOf(() =>
      resolveHeryModules(['@heryjs/mail', '@heryjs/mail'], installed),
    );

    expect(error.message).toContain('@heryjs/mail: declared twice');
  });

  it('names every problem at once', () => {
    const error = errorOf(() =>
      resolveHeryModules(
        ['@heryjs/sso', '@heryjs/mail-resend', ['@acme/channel', {}]],
        installed,
      ),
    );

    expect(error.message.split('\n')).toHaveLength(4);
  });
});
