import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../lib/module-registry';

const MODULE_FILE = 'src/technical/graphql/graphql.module.ts';
const GUARD_FILE = 'src/technical/auth/gql-session.guard.ts';
const DECORATOR_FILE = 'src/technical/auth/current-gql-request.decorator.ts';

const MODULE_CONTENT = `import { ApolloDriver } from '@nestjs/apollo';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule as NestGraphQLModule } from '@nestjs/graphql';

@Module({
  imports: [
    NestGraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      context: ({ req }: { req: unknown }) => ({ req }),
    }),
  ],
})
export class GraphqlModule {}
`;

const GUARD_CONTENT = `import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Request } from 'express';
import { AUTH_PROVIDER } from './auth.types';
import type { AuthenticatedUser, AuthProvider } from './auth.types';
import {
  MissingSessionException,
  InvalidSessionException,
} from '../errors/invalid-session.exception';

export type GqlRequestWithUser = Request & { user: AuthenticatedUser };

@Injectable()
export class GqlSessionGuard implements CanActivate {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = GqlExecutionContext.create(context).getContext<{
      req: Request;
    }>().req;

    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : undefined;

    if (!token) {
      throw new MissingSessionException();
    }

    const user = await this.authProvider.validateSession(token);

    if (!user) {
      throw new InvalidSessionException();
    }

    (request as GqlRequestWithUser).user = user;
    return true;
  }
}
`;

const DECORATOR_CONTENT = `import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GqlRequestWithUser } from './gql-session.guard';

export const CurrentGqlRequest = createParamDecorator(
  (_: unknown, context: ExecutionContext): GqlRequestWithUser =>
    GqlExecutionContext.create(context).getContext<{
      req: GqlRequestWithUser;
    }>().req,
);
`;

registerModule({
  name: 'graphql',
  description:
    'Add a GraphQL endpoint (Apollo driver) with a session guard mirroring the REST auth flow. Use "hery generate <Name> --graphql" to add a resolver to a resource.',
  dependencies: [
    '@nestjs/graphql',
    '@nestjs/apollo',
    '@apollo/server',
    '@as-integrations/express5',
    'graphql',
  ],
  install() {
    const files: Record<string, string> = {
      [MODULE_FILE]: MODULE_CONTENT,
      [GUARD_FILE]: GUARD_CONTENT,
      [DECORATOR_FILE]: DECORATOR_CONTENT,
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
      `  1. Import ${pc.bold('GraphqlModule')} into src/app.module.ts`,
    );
    console.log(
      `  2. Run "hery generate <Name> --graphql" to add a resolver to a resource`,
    );
  },
});
