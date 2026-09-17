import { Logger } from '@nestjs/common';
import { LogMailDriver } from './log-mail.driver';
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

// The default driver is what a freshly generated app mails with, so what it
// writes to the log is the whole of its observable behaviour.
describe('log mail driver', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the message instead of sending it', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const driver = new LogMailDriver();

    await expect(
      driver.send({
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

describe('escaping', () => {
  /**
   * The values a template carries are exactly the ones that come from a
   * request -- a display name, a company, an order reference -- so anything a
   * user typed used to reach the recipient's mail client as markup.
   */
  it('escapes markup a user typed', () => {
    const { html } = renderTemplate('welcome', {
      name: '<script>alert(1)</script>',
      app: 'HeryJs',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes the characters that break out of an attribute', () => {
    const { html } = renderTemplate('welcome', {
      name: `" onmouseover='x'`,
      app: 'HeryJs',
    });

    expect(html).toContain('&quot;');
    expect(html).toContain('&#39;');
    expect(html).not.toContain("onmouseover='x'");
  });

  // Escaped first, so a value containing &lt; does not become &amp;lt;.
  it('escapes an ampersand once, not twice', () => {
    const { html } = renderTemplate('welcome', { name: 'A & B', app: 'X' });

    expect(html).toContain('A &amp; B');
    expect(html).not.toContain('&amp;amp;');
  });

  // Plain text in every mail client, so escaping it would show a reader
  // `&amp;` where they wrote `&`.
  it('leaves the subject unescaped, because it is not markup', () => {
    const { subject } = renderTemplate('welcome', { name: 'x', app: 'A & B' });

    expect(subject).toBe('Welcome to A & B');
  });

  it('keeps the template author markup intact', () => {
    const { html } = renderTemplate('welcome', { name: 'Ada', app: 'HeryJs' });

    expect(html).toBe('<p>Hi Ada, welcome to HeryJs.</p>');
  });
});
