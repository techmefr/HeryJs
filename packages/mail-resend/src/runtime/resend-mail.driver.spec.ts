import { ResendMailDriver } from './resend-mail.driver';

const message = {
  to: 'someone@example.com',
  subject: 'Welcome',
  html: '<p>Hi</p>',
};

function stubFetch(response: Response): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
}

describe('ResendMailDriver', () => {
  const driver = new ResendMailDriver();

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'key-123';
    process.env.RESEND_FROM = 'noreply@example.com';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
  });

  it('posts the message to Resend with the configured sender', async () => {
    const fetched = stubFetch(new Response('{}', { status: 200 }));

    await driver.send(message);

    const [url, init] = fetched.mock.calls[0] as [
      string,
      { method: string; body: string },
    ];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      from: 'noreply@example.com',
      to: 'someone@example.com',
      subject: 'Welcome',
      html: '<p>Hi</p>',
    });
  });

  /**
   * Thrown, not logged: the caller is the mail processor, and the throw is what
   * flips the MailLog row to "failed". Swallowing it would record a message as
   * sent that Resend rejected.
   */
  it('throws on a refusal so the mail log cannot record it as sent', async () => {
    stubFetch(new Response('domain not verified', { status: 403 }));

    await expect(driver.send(message)).rejects.toThrow(/403/);
  });

  it('refuses to send with no API key rather than posting an unauthenticated request', async () => {
    delete process.env.RESEND_API_KEY;
    const fetched = stubFetch(new Response('{}', { status: 200 }));

    await expect(driver.send(message)).rejects.toThrow();
    expect(fetched).not.toHaveBeenCalled();
  });
});
