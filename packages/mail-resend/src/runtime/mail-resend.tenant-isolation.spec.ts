import { ResendMailDriver } from './resend-mail.driver';

describe('tenant isolation', () => {
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

  it('sends each tenant message as its own request carrying nothing of the other', async () => {
    const fetched = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('{}', { status: 200 })),
      );

    await Promise.all([
      driver.send({
        to: 'a@tenant-a.test',
        subject: 'For A',
        html: '<p>secret of A</p>',
      }),
      driver.send({
        to: 'b@tenant-b.test',
        subject: 'For B',
        html: '<p>secret of B</p>',
      }),
    ]);

    const bodies = fetched.mock.calls.map(
      ([, init]) => (init as { body: string }).body,
    );

    expect(bodies).toHaveLength(2);
    expect(bodies.find((body) => body.includes('a@tenant-a.test'))).not.toMatch(
      /tenant-b|of B/,
    );
    expect(bodies.find((body) => body.includes('b@tenant-b.test'))).not.toMatch(
      /tenant-a|of A/,
    );
  });
});
