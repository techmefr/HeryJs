import { createServer } from 'node:net';
import type { AddressInfo, Server, Socket } from 'node:net';
import { SmtpMailDriver } from './smtp-mail.driver';

interface Envelope {
  recipients: string[];
  data: string;
}

class RecordingSmtpServer {
  readonly envelopes: Envelope[] = [];

  private readonly server: Server = createServer((socket) =>
    this.converse(socket),
  );

  async listen(): Promise<number> {
    await new Promise<void>((resolve) =>
      this.server.listen(0, '127.0.0.1', resolve),
    );

    return (this.server.address() as AddressInfo).port;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private converse(socket: Socket): void {
    let current: Envelope = { recipients: [], data: '' };
    let buffer = '';
    let inData = false;

    socket.write('220 fake.test ESMTP\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      if (inData) {
        const end = buffer.indexOf('\r\n.\r\n');

        if (end === -1) {
          return;
        }

        current.data = buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        inData = false;
        this.envelopes.push(current);
        current = { recipients: [], data: '' };
        socket.write('250 queued\r\n');
      }

      let newline = buffer.indexOf('\r\n');

      while (!inData && newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        const verb = line.slice(0, 4).toUpperCase();

        if (verb === 'EHLO' || verb === 'HELO') {
          socket.write('250 fake.test\r\n');
        } else if (verb === 'RCPT') {
          current.recipients.push(line);
          socket.write('250 ok\r\n');
        } else if (verb === 'DATA') {
          inData = true;
          socket.write('354 go\r\n');
        } else if (verb === 'QUIT') {
          socket.end('221 bye\r\n');
          return;
        } else {
          socket.write('250 ok\r\n');
        }

        newline = buffer.indexOf('\r\n');
      }
    });
  }
}

describe('tenant isolation', () => {
  const server = new RecordingSmtpServer();
  const driver = new SmtpMailDriver();

  beforeAll(async () => {
    process.env.MAIL_SMTP_HOST = '127.0.0.1';
    process.env.MAIL_SMTP_PORT = String(await server.listen());
    process.env.MAIL_SMTP_TLS = 'none';
    process.env.MAIL_SMTP_FROM = 'noreply@example.com';
  });

  afterAll(async () => {
    await server.close();
    delete process.env.MAIL_SMTP_HOST;
    delete process.env.MAIL_SMTP_PORT;
    delete process.env.MAIL_SMTP_TLS;
    delete process.env.MAIL_SMTP_FROM;
  });

  it('delivers each tenant message in its own envelope carrying nothing of the other', async () => {
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

    expect(server.envelopes).toHaveLength(2);

    for (const envelope of server.envelopes) {
      expect(envelope.recipients).toHaveLength(1);
    }

    const forA = server.envelopes.find((envelope) =>
      envelope.recipients[0]?.includes('tenant-a'),
    );
    const forB = server.envelopes.find((envelope) =>
      envelope.recipients[0]?.includes('tenant-b'),
    );

    expect(forA?.data).toContain('secret of A');
    expect(forA?.data).not.toMatch(/tenant-b|of B/);
    expect(forB?.data).toContain('secret of B');
    expect(forB?.data).not.toMatch(/tenant-a|of A/);
  });
});
