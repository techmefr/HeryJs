import { buildMailable } from './make-mail';

describe('the mailable make:mail writes', () => {
  it('names the class after what the developer typed', () => {
    const mailable = buildMailable('WelcomeMail');

    expect(mailable.fileName).toBe('welcome-mail.ts');
    expect(mailable.source).toContain(
      'export class WelcomeMail implements Mailable',
    );
  });

  // The mailable lands next to the code that sends it, and a name ending in
  // Mail says nothing about where that is, so the suffix is dropped.
  it('defaults the domain to the name without its Mail suffix', () => {
    expect(buildMailable('WelcomeMail').domain).toBe('welcome');
    expect(buildMailable('InvoicePaidMail').domain).toBe('invoice-paid');
  });

  it('takes an explicit domain over the derived one', () => {
    expect(buildMailable('WelcomeMail', 'Onboarding').domain).toBe(
      'onboarding',
    );
  });

  /**
   * The contract lives in the kernel rather than the mail module, so a
   * mailable generated into a project without the module installed still
   * typechecks. Importing it from anywhere else would break that.
   */
  it('imports the contract from the kernel', () => {
    expect(buildMailable('WelcomeMail').source).toContain(
      "from '#technical/mail/mail-driver'",
    );
  });

  it('knows its recipient and nothing about transport', () => {
    const source = buildMailable('WelcomeMail').source;

    expect(source).toContain('constructor(readonly to: string) {}');
    expect(source).toContain('build(): MailMessage');
    expect(source).not.toContain('Driver');
  });
});
