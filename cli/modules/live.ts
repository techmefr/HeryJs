import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../lib/module-registry';

const GUARD_FILE = 'src/technical/live/live-auth.guard.ts';
const WITH_TENANT_FILE = 'src/technical/live/with-tenant.ts';
const MODULE_FILE = 'src/technical/live/live.module.ts';

const GUARD_CONTENT = `import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Socket } from 'socket.io';
import { AUTH_PROVIDER } from '../auth/auth.types';
import type { AuthenticatedUser, AuthProvider } from '../auth/auth.types';

export type LiveSocket = Omit<Socket, 'data'> & {
  data: { user: AuthenticatedUser };
};

export async function authenticateLiveSocket(
  client: LiveSocket,
  authProvider: AuthProvider,
): Promise<boolean> {
  if (client.data.user) {
    return true;
  }

  const token = client.handshake.auth?.token as string | undefined;
  if (!token) {
    return false;
  }

  const user = await authProvider.validateSession(token);
  if (!user) {
    return false;
  }

  client.data.user = user;
  return true;
}

@Injectable()
export class LiveAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<LiveSocket>();
    return authenticateLiveSocket(client, this.authProvider);
  }
}
`;

const WITH_TENANT_CONTENT = `import { TenantContextStorage } from '../tenancy/tenant-context';
import type { LiveSocket } from './live-auth.guard';

// WebSocket message handlers never go through TenantMiddleware (it only
// wraps the initial HTTP handshake, not each subsequent message on an
// already-open connection), so each handler must open its own tenant
// context explicitly, derived from the user resolved once at connection
// time by LiveAuthGuard -- never trusted from a client-sent field.
export function withTenant<T>(
  client: LiveSocket,
  fn: () => Promise<T>,
): Promise<T> {
  return TenantContextStorage.run(
    { tenantId: client.data.user.tenantId },
    fn,
  );
}
`;

const MODULE_CONTENT = `import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LiveAuthGuard } from './live-auth.guard';

@Module({
  imports: [AuthModule],
  providers: [LiveAuthGuard],
  exports: [LiveAuthGuard],
})
export class LiveModule {}
`;

registerModule({
  name: 'live',
  description:
    'Add bidirectional WebSocket support (Socket.IO). Use "hery generate <Name> --live" to add a live gateway to a resource.',
  dependencies: [
    '@nestjs/websockets',
    '@nestjs/platform-socket.io',
    'socket.io',
  ],
  install() {
    const files: Record<string, string> = {
      [GUARD_FILE]: GUARD_CONTENT,
      [WITH_TENANT_FILE]: WITH_TENANT_CONTENT,
      [MODULE_FILE]: MODULE_CONTENT,
    };

    for (const [filePath, content] of Object.entries(files)) {
      if (existsSync(filePath)) {
        console.log(pc.yellow(`${filePath} already exists, skipping.`));
        continue;
      }

      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
      console.log(pc.green(`✔ ${filePath}`));
    }

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(
      `  1. Run "hery generate <Name> --live" to add a live gateway to a resource`,
    );
    console.log(
      `  2. Import ${pc.bold('LiveModule')} and add ${pc.bold('<Name>LiveGateway')} to the imports/providers of <name>.module.ts`,
    );
    console.log(
      `  3. Clients connect with "io('/live/<name>', { auth: { token } })" using the same bearer token as REST`,
    );
  },
});
