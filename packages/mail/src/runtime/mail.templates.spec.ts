import { Logger } from '@nestjs/common';
import { ConsoleMailProvider } from './console-mail.provider';
import { renderTemplate } from './mail.templates';

describe('mail templates', () => {
  it('fills every placeholder from the data it is given', () => {
    expect(
      renderTemplate('welcome', { name: 'Gaetan', app: 'HeryJs' }),
    ).toEqual({
      subject: 'Welcome to HeryJs',
      html: '<p>Hi Gaetan, welcome to HeryJs.</p>',
    });
  });

  // A missing key renders as nothing rather than leaving {{name}} in the body:
  // a mail that reads "Hi ," is wrong, but a mail showing its own template
  // syntax to a recipient is worse, and silently keeping the braces would let
  // it ship unnoticed.
  it('renders a missing key as empty instead of leaving the placeholder', () => {
    expect(renderTemplate('welcome', { app: 'HeryJs' })).toEqual({
      subject: 'Welcome to HeryJs',
      html: '<p>Hi , welcome to HeryJs.</p>',
    });
  });

  it('refuses a template it does not know instead of sending an empty mail', () => {
    expect(() => renderTemplate('does-not-exist')).toThrow(
      'Unknown mail template "does-not-exist"',
    );
  });

  it('leaves an unknown placeholder out of the rendered body', () => {
    const { html } = renderTemplate('welcome', {});

    expect(html).not.toContain('{{');
  });
});

// The default provider is what a freshly generated app mails with, so what it
// writes to the log is the whole of its observable behaviour.
describe('console mail provider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the message instead of sending it', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const provider = new ConsoleMailProvider();

    await expect(
      provider.send({
        to: 'someone@example.com',
        subject: 'Welcome to HeryJs',
        html: '<p>Hi</p>',
      }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      'to=someone@example.com subject="Welcome to HeryJs"',
    );
  });
});
