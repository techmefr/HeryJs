import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { buildDriver } from './make-driver';
import type { DriverBuild } from './make-driver';

function contract(moduleName: string): string {
  return readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'src',
      'technical',
      moduleName,
      `${moduleName}-driver.ts`,
    ),
    'utf8',
  );
}

function built(result: DriverBuild) {
  if (!result.isBuilt) {
    throw new Error(result.reason);
  }

  return result.files;
}

describe('make:driver', () => {
  it('implements the contract the module declares', () => {
    const files = built(buildDriver('mail', 'postmark', contract('mail')));

    expect(files.className).toBe('PostmarkMailDriver');
    expect(files.driverFileName).toBe('postmark-mail.driver.ts');
    expect(files.driverSource).toContain(
      'export class PostmarkMailDriver implements MailDriver',
    );
    expect(files.driverSource).toContain(
      "import type { MailDriver, MailMessage } from '#technical/mail/mail-driver';",
    );
    expect(files.driverSource).toContain(
      'send(_message: MailMessage): Promise<void> {',
    );
  });

  it('fails loudly on an unimplemented method instead of pretending to send', () => {
    const files = built(buildDriver('sms', 'twilio', contract('sms')));

    expect(files.driverSource).toContain(
      "Promise.reject(new Error('TwilioSmsDriver.send is not implemented yet'))",
    );
  });

  it('provides the token the module registry looks the driver up by', () => {
    const files = built(buildDriver('mail', 'postmark', contract('mail')));

    expect(files.moduleFileName).toBe('postmark-mail.module.ts');
    expect(files.moduleSource).toContain("driverToken('mail', 'postmark')");
    expect(files.moduleSource).toContain(
      '{ provide: TOKEN, useExisting: PostmarkMailDriver }',
    );
  });

  it('strips a trailing Driver from the name', () => {
    const files = built(
      buildDriver('mail', 'PostmarkDriver', contract('mail')),
    );

    expect(files.className).toBe('PostmarkMailDriver');
  });

  it('keeps every parameter of a multi-line method, and the types they use', () => {
    const files = built(buildDriver('push', 'fcm', contract('push')));

    expect(files.driverSource).toContain(
      '  send(\n    _token: string,\n    _platform: PushPlatform,\n    _message: PushMessage,\n  ): Promise<PushOutcome> {',
    );
  });

  it('declares readonly properties of the contract', () => {
    const files = built(buildDriver('export', 'ods', contract('export')));

    expect(files.driverSource).toContain("readonly extension = '';");
    expect(files.driverSource).toContain("readonly contentType = '';");
    expect(files.driverSource).toContain(
      'render(_exportable: Exportable): Promise<Buffer> {',
    );
  });

  it('copies the imports of a contract that refers to other files', () => {
    const files = built(buildDriver('storage', 's3x', contract('storage')));

    expect(files.driverSource).toMatch(/import type \{[^}]*\} from '[^']+';/);
    expect(files.driverSource).toContain('presignPut(');
  });

  it('reports a file with no driver interface instead of writing nothing useful', () => {
    const result = buildDriver('mail', 'x', 'export const A = 1;');

    expect(result.isBuilt).toBe(false);
  });
});
