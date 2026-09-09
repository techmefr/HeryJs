import { createServer, type Server, type Socket } from 'node:net';
import { runInfraChecks, speaksRedis } from './infra-checks';

const accepted: Socket[] = [];

function listen(onConnection?: (socket: Socket) => void) {
  return new Promise<{ server: Server; port: number }>((resolve) => {
    const server = createServer((socket) => {
      accepted.push(socket);
      onConnection?.(socket);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

// server.close() waits on connections that are still open, and a probe that
// gave up on an answer leaves one behind on the server side.
function close(server: Server): Promise<void> {
  accepted.splice(0).forEach((socket) => socket.destroy());

  return new Promise((resolve) => server.close(() => resolve()));
}

describe('infra checks', () => {
  const original = { ...process.env };
  const servers: Server[] = [];

  afterEach(async () => {
    process.env = { ...original };
    await Promise.all(servers.splice(0).map(close));
  });

  it('refuses a port that accepts connections but does not answer as PostgreSQL', async () => {
    const { server, port } = await listen();
    servers.push(server);

    process.env.DATABASE_URL = `postgresql://heryjs:heryjs@127.0.0.1:${port}/heryjs`;
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`;

    const [postgres] = await runInfraChecks();

    expect(postgres?.ok).toBe(false);
    expect(postgres?.hint).toContain('does not answer as PostgreSQL');
    expect(postgres?.hint).toContain('hery up --start');
  });

  it('refuses a port that accepts connections but does not answer a PING', async () => {
    const { server, port } = await listen();
    servers.push(server);

    process.env.DATABASE_URL = `postgresql://heryjs:heryjs@127.0.0.1:${port}/heryjs`;
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`;

    const [, valkey] = await runInfraChecks();

    expect(valkey?.ok).toBe(false);
    expect(valkey?.hint).toContain('does not answer as Valkey');
  });

  it('reports a closed port as a service to start rather than a wrong one', async () => {
    const { server, port } = await listen();
    servers.push(server);
    await close(servers.splice(0, 1)[0]!);

    process.env.DATABASE_URL = `postgresql://heryjs:heryjs@127.0.0.1:${port}/heryjs`;
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`;

    const [postgres, valkey] = await runInfraChecks();

    expect(postgres?.hint).toBe('run "docker compose up -d postgres"');
    expect(valkey?.hint).toBe('run "docker compose up -d valkey"');
  });

  /**
   * A container publishes its port before the service behind it replies, so
   * the check that runs straight after `--start` saw a socket that accepted
   * the connection and a protocol that stayed silent -- and blamed the one
   * thing that cannot be true there, a port belonging to another service.
   */
  it('waits for a service that starts answering, rather than blaming the port', async () => {
    let answering = false;
    const { server, port } = await listen((socket) =>
      socket.on('data', () => {
        if (answering) {
          socket.write('+PONG\r\n');
        }
      }),
    );
    servers.push(server);
    setTimeout(() => {
      answering = true;
    }, 1200);

    process.env.DATABASE_URL = `postgresql://heryjs:heryjs@127.0.0.1:${port}/heryjs`;
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`;

    const [, waited] = await runInfraChecks({ waitMs: 5000 });

    expect(waited?.ok).toBe(true);
    expect(waited?.hint).toBeUndefined();
  });

  /**
   * Without a wait it reports the state of the world now, which is what the
   * plain command is for -- the same silent socket, called out immediately.
   * One pass over a silent port costs the probe timeouts themselves, so the
   * bound below is what separates one pass from a second one.
   */
  it('does not wait when it was not asked to', async () => {
    const { server, port } = await listen();
    servers.push(server);

    process.env.DATABASE_URL = `postgresql://heryjs:heryjs@127.0.0.1:${port}/heryjs`;
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`;

    const started = Date.now();
    const [, valkey] = await runInfraChecks();

    expect(valkey?.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('accepts a server that answers the PING', async () => {
    const { server, port } = await listen((socket) =>
      socket.on('data', () => socket.write('+PONG\r\n')),
    );
    servers.push(server);

    await expect(speaksRedis('127.0.0.1', port)).resolves.toBe(true);
  });
});
