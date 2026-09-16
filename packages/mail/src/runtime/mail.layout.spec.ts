import { mailLayout } from './mail.layout';

describe('mailLayout', () => {
  it('wraps the body in a document a mail client will render', () => {
    const html = mailLayout('<p>Hello</p>', { title: 'Welcome' });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>Welcome</title>');
    expect(html).toContain('<p>Hello</p>');
  });

  /**
   * Every mail client strips a stylesheet, so a layout that relied on one
   * renders as unstyled text in half the inboxes it reaches.
   */
  it('styles inline rather than through a stylesheet', () => {
    const html = mailLayout('<p>Hello</p>', { title: 'Welcome' });

    expect(html).not.toContain('<style');
    expect(html).toContain('style="');
  });

  // Legally required in several countries for anything not transactional, and
  // absent by default because only the caller knows which kind this is.
  it('omits the opt-out unless the caller asks for one', () => {
    expect(mailLayout('<p>Hi</p>', { title: 'Receipt' })).not.toContain(
      'unsubscribe',
    );
  });

  it('renders the opt-out where one is given', () => {
    const html = mailLayout('<p>Hi</p>', {
      title: 'Newsletter',
      optOut: { label: 'unsubscribe', url: 'https://app.test/unsubscribe' },
    });

    expect(html).toContain('https://app.test/unsubscribe');
    expect(html).toContain('unsubscribe');
  });
});
