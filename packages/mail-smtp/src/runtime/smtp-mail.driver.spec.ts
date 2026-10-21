import { createServer } from 'node:net';
import type { AddressInfo, Server, Socket } from 'node:net';
import { SmtpMailDriver } from './smtp-mail.driver';

const message = {
  to: 'someone@example.com',
  subject: 'Welcome',
  html: '<p>Hi</p>',
};

interface Received {
  from: string;
  recipients: string[];
  data: string;
  credentials: string | null;
}

/**
 * A real SMTP dialogue over a real socket, small enough to read in one go: it
 * greets, advertises PLAIN auth, records the envelope and the DATA block, and
 * can refuse every recipient. The driver is exercised end to end against it,
 * nodemailer included, so what is proven is delivery and not a mock's shape.
 */
class FakeSmtpServer {
  readonly received: Received[] = [];

  private readonly server: Server;

  constructor(private readonly refuseRecipients = false) {
    this.server = createServer((socket) => this.converse(socket));
  }

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
    const current: Received = {
      from: '',
      recipients: [],
      data: '',
      credentials: null,
    };
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
        this.received.push({ ...current });
        socket.write('250 2.0.0 queued\r\n');
      }

      let newline = buffer.indexOf('\r\n');

      while (newline !== -1 && !inData) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        inData = this.answer(socket, line, current);
        newline = buffer.indexOf('\r\n');
      }
    });

    socket.on('error', () => undefined);
  }

  private answer(socket: Socket, line: string, current: Received): boolean {
    const command = line.toUpperCase();

    if (command.startsWith('EHLO')) {
      socket.write('250-fake.test\r\n250 AUTH PLAIN\r\n');
    } else if (command.startsWith('AUTH PLAIN')) {
      current.credentials = Buffer.from(line.slice(11), 'base64')
        .toString('utf8')
        .replace(/\0/g, ' ')
        .trim();
      socket.write('235 2.7.0 accepted\r\n');
    } else if (command.startsWith('MAIL FROM')) {
      current.from = line.slice(line.indexOf('<') + 1, line.indexOf('>'));
      socket.write('250 ok\r\n');
    } else if (command.startsWith('RCPT TO')) {
      if (this.refuseRecipients) {
        socket.write('550 5.1.1 no such user\r\n');
      } else {
        current.recipients.push(
          line.slice(line.indexOf('<') + 1, line.indexOf('>')),
        );
        socket.write('250 ok\r\n');
      }
    } else if (command === 'DATA') {
      socket.write('354 go ahead\r\n');

      return true;
    } else if (command === 'QUIT') {
      socket.write('221 bye\r\n');
      socket.end();
    } else {
      socket.write('250 ok\r\n');
    }

    return false;
  }
}

describe('SmtpMailDriver', () => {
  const driver = new SmtpMailDriver();
  let server: FakeSmtpServer;

  async function start(refuseRecipients = false): Promise<void> {
    server = new FakeSmtpServer(refuseRecipients);
    process.env.MAIL_SMTP_PORT = String(await server.listen());
  }

  beforeEach(() => {
    process.env.MAIL_SMTP_HOST = '127.0.0.1';
    process.env.MAIL_SMTP_TLS = 'none';
    process.env.MAIL_SMTP_FROM = 'noreply@example.com';
  });

  afterEach(async () => {
    await server.close();
    delete process.env.MAIL_SMTP_HOST;
    delete process.env.MAIL_SMTP_PORT;
    delete process.env.MAIL_SMTP_TLS;
    delete process.env.MAIL_SMTP_USER;
    delete process.env.MAIL_SMTP_PASSWORD;
    delete process.env.MAIL_SMTP_FROM;
  });

  it('delivers the message to the server with the configured sender', async () => {
    await start();

    await driver.send(message);

    expect(server.received).toHaveLength(1);
    expect(server.received[0]?.from).toBe('noreply@example.com');
    expect(server.received[0]?.recipients).toEqual(['someone@example.com']);
    expect(server.received[0]?.data).toContain('Subject: Welcome');
    expect(server.received[0]?.data).toContain('<p>Hi</p>');
  });

  it('authenticates with the configured credentials', async () => {
    await start();
    process.env.MAIL_SMTP_USER = 'mailer';
    process.env.MAIL_SMTP_PASSWORD = 's3cret';

    await driver.send(message);

    expect(server.received[0]?.credentials).toBe('mailer s3cret');
  });

  /**
   * Thrown, not logged: the caller is the mail processor, and the throw is what
   * flips the MailLog row to "failed". Swallowing it would record a message as
   * sent that the server rejected.
   */
  it('throws when the server refuses the recipient so the mail log cannot record it as sent', async () => {
    await start(true);

    await expect(driver.send(message)).rejects.toThrow();
    expect(server.received).toHaveLength(0);
  });

  it('throws when no server is listening', async () => {
    await start();
    await server.close();
    server = new FakeSmtpServer();

    await expect(driver.send(message)).rejects.toThrow();
  });

  it('refuses a username without a password instead of sending anonymously', async () => {
    await start();
    process.env.MAIL_SMTP_USER = 'mailer';

    await expect(driver.send(message)).rejects.toThrow(/MAIL_SMTP_PASSWORD/);
    expect(server.received).toHaveLength(0);
  });

  it('refuses to send with no host configured', async () => {
    await start();
    delete process.env.MAIL_SMTP_HOST;

    await expect(driver.send(message)).rejects.toThrow(/MAIL_SMTP_HOST/);
  });
});
